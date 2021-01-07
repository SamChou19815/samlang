import type OptimizationResourceAllocator from './optimization-resource-allocator';

import analyzeAvailableExpressionsComingOutAtEachStatement, {
  HighIRExpressionWrapper,
} from 'samlang-core-analysis/available-expressions-analysis';
import { HighIRExpression, HIR_VARIABLE } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import { MidIRStatement, MIR_MOVE_TEMP } from 'samlang-core-ast/mir-nodes';
import {
  ReadonlyHashMap,
  ReadonlyHashSet,
  hashMapOf,
  hashSetOf,
  assertNotNull,
  checkNotNull,
} from 'samlang-core-utils';

const expressionIsPrimitive = (expression: HighIRExpression): boolean =>
  expression.__type__ === 'HighIRIntLiteralExpression' ||
  expression.__type__ === 'HighIRNameExpression' ||
  expression.__type__ === 'HighIRVariableExpression';

/** @returns whether the given expression is primitive or a simple add, sub, xor. */
const expressionIsSimple = (expression: HighIRExpression): boolean => {
  if (expressionIsPrimitive(expression)) return true;
  if (expression.__type__ !== 'HighIRBinaryExpression') return false;
  const { operator, e1, e2 } = expression;
  switch (operator) {
    case '+':
    case '-':
    case '^':
      return expressionIsPrimitive(e1) && expressionIsPrimitive(e2);
    default:
      return false;
  }
};

const collectExpressionUsages = (
  statement: MidIRStatement
): ReadonlyHashSet<HighIRExpressionWrapper> => {
  const collector = hashSetOf<HighIRExpressionWrapper>();

  const searchAndCollect = (expressionToSearch: HighIRExpression): void => {
    if (expressionIsSimple(expressionToSearch)) {
      return;
    }
    collector.add(new HighIRExpressionWrapper(expressionToSearch));

    switch (expressionToSearch.__type__) {
      case 'HighIRIndexAccessExpression':
        searchAndCollect(expressionToSearch.expression);
        break;
      case 'HighIRBinaryExpression':
        searchAndCollect(expressionToSearch.e1);
        searchAndCollect(expressionToSearch.e2);
        break;
    }
  };

  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      searchAndCollect(statement.source);
      break;
    case 'MidIRMoveMemStatement':
      searchAndCollect(statement.source);
      searchAndCollect(statement.memoryIndexExpression);
      break;
    case 'MidIRCallFunctionStatement':
      searchAndCollect(statement.functionExpression);
      statement.functionArguments.forEach(searchAndCollect);
      break;
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      break;
    case 'MidIRConditionalJumpFallThrough':
      searchAndCollect(statement.conditionExpression);
      break;
    case 'MidIRReturnStatement':
      searchAndCollect(statement.returnedExpression);
      break;
  }

  return collector;
};

type ExpressionUsageAndFirstAppears = {
  readonly appears: ReadonlySet<number>;
  readonly usage: ReadonlySet<number>;
};

// eslint-disable-next-line camelcase
export const computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING = (
  statements: readonly MidIRStatement[]
): ReadonlyHashMap<HighIRExpressionWrapper, ExpressionUsageAndFirstAppears> => {
  const availableExpressionAnalysisResult = analyzeAvailableExpressionsComingOutAtEachStatement(
    statements
  );

  const map = hashMapOf<HighIRExpressionWrapper, { appears: Set<number>; usage: Set<number> }>();
  statements.forEach((statement, index) => {
    const analysisResultForStatement = availableExpressionAnalysisResult[index];
    assertNotNull(analysisResultForStatement);

    analysisResultForStatement.forEach((apperances, expressionWrapper) => {
      const appearsAndUses = map.get(expressionWrapper);
      if (appearsAndUses == null) {
        map.set(expressionWrapper, { appears: new Set(apperances), usage: new Set() });
      } else {
        apperances.forEach((appearId) => appearsAndUses.appears.add(appearId));
      }
    });

    collectExpressionUsages(statement).forEach((expressionWrapper) => {
      const appearsAndUses = map.get(expressionWrapper);
      assertNotNull(appearsAndUses);
      // istanbul ignore next
      if (appearsAndUses == null) {
        // istanbul ignore next
        map.set(expressionWrapper, { appears: new Set(), usage: new Set([index]) });
      } else {
        appearsAndUses.usage.add(index);
      }
    });
  });

  return map;
};

const replaceExpressionByHoistedTemporary = (
  expression: HighIRExpression,
  replacementMap: ReadonlyHashMap<HighIRExpressionWrapper, string>
): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
      return expression;
    case 'HighIRIndexAccessExpression': {
      const replacement = replacementMap.get(new HighIRExpressionWrapper(expression));
      if (replacement != null) {
        return HIR_VARIABLE(replacement, HIR_INT_TYPE);
      }
      return {
        ...expression,
        expression: replaceExpressionByHoistedTemporary(expression.expression, replacementMap),
      };
    }
    case 'HighIRBinaryExpression': {
      const replacement = replacementMap.get(new HighIRExpressionWrapper(expression));
      if (replacement != null) {
        return HIR_VARIABLE(replacement, HIR_INT_TYPE);
      }
      return {
        ...expression,
        e1: replaceExpressionByHoistedTemporary(expression.e1, replacementMap),
        e2: replaceExpressionByHoistedTemporary(expression.e2, replacementMap),
      };
    }
  }
};

const rewriteStatementByReplacingExpressionByHoistedTemporary = (
  statement: MidIRStatement,
  replacementMap: ReadonlyHashMap<HighIRExpressionWrapper, string>
): MidIRStatement => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return {
        ...statement,
        source: replaceExpressionByHoistedTemporary(statement.source, replacementMap),
      };
    case 'MidIRMoveMemStatement':
      return {
        ...statement,
        memoryIndexExpression: replaceExpressionByHoistedTemporary(
          statement.memoryIndexExpression,
          replacementMap
        ),
        source: replaceExpressionByHoistedTemporary(statement.source, replacementMap),
      };
    case 'MidIRCallFunctionStatement':
      return {
        ...statement,
        functionExpression: replaceExpressionByHoistedTemporary(
          statement.functionExpression,
          replacementMap
        ),
        functionArguments: statement.functionArguments.map((it) =>
          replaceExpressionByHoistedTemporary(it, replacementMap)
        ),
      };
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return statement;
    case 'MidIRConditionalJumpFallThrough':
      return {
        ...statement,
        conditionExpression: replaceExpressionByHoistedTemporary(
          statement.conditionExpression,
          replacementMap
        ),
      };
    case 'MidIRReturnStatement':
      return {
        ...statement,
        returnedExpression: replaceExpressionByHoistedTemporary(
          statement.returnedExpression,
          replacementMap
        ),
      };
  }
};

const expressionContainsTemporary = (
  expression: HighIRExpression,
  temporaryName: string
): boolean => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return false;
    case 'HighIRVariableExpression':
      return expression.name === temporaryName;
    case 'HighIRIndexAccessExpression':
      return expressionContainsTemporary(expression.expression, temporaryName);
    case 'HighIRBinaryExpression':
      return (
        expressionContainsTemporary(expression.e1, temporaryName) ||
        expressionContainsTemporary(expression.e2, temporaryName)
      );
  }
};

type HoistingListAndReplacementMap = {
  readonly hoistingLists: readonly (readonly [string, HighIRExpression])[][];
  readonly replacementMaps: readonly ReadonlyHashMap<HighIRExpressionWrapper, string>[];
};

const computeHoistingListAndReplacementMap = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator
): HoistingListAndReplacementMap => {
  const globalUsageAndAppearMap = computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING(
    statements
  );
  const hoistingMaps = new Map<number, Map<string, HighIRExpression>>();
  const replacementMaps = statements.map(() => hashMapOf<HighIRExpressionWrapper, string>());

  globalUsageAndAppearMap.forEach((usageAndAppearance, expressionToReplaceWrapper) => {
    if (usageAndAppearance.appears.size < usageAndAppearance.usage.size) {
      // Only hoist expressions when it's used more than it's defined.
      const tempForHoistedExpression = allocator.allocateCSEHoistedTemporary();
      usageAndAppearance.usage.forEach((usagePlace) => {
        checkNotNull(replacementMaps[usagePlace]).set(
          expressionToReplaceWrapper,
          tempForHoistedExpression
        );
      });
      usageAndAppearance.appears.forEach((appearId) => {
        const hoistingMap = hoistingMaps.get(appearId);
        if (hoistingMap == null) {
          hoistingMaps.set(
            appearId,
            new Map([[tempForHoistedExpression, expressionToReplaceWrapper.expression]])
          );
        } else {
          hoistingMap.set(tempForHoistedExpression, expressionToReplaceWrapper.expression);
        }
      });
    }
  });

  const hoistingLists = statements.map((_, index) => {
    const hoistingMap = hoistingMaps.get(index) ?? new Map<string, HighIRExpression>();
    // cleanup hoisting map to avoid repeated computation of sub expressions.
    const replacementMapForHoistingMap = hashMapOf(
      ...Array.from(hoistingMap.entries()).map(
        ([temporary, expression]) => [new HighIRExpressionWrapper(expression), temporary] as const
      )
    );
    return Array.from(hoistingMap.entries())
      .map(([newTemporary, hoistedExpression]) => {
        // Delete mapping to self temporary to avoid trivial replacement.
        replacementMapForHoistingMap.delete(new HighIRExpressionWrapper(hoistedExpression));
        const simplifiedHoistedExpression = replaceExpressionByHoistedTemporary(
          hoistedExpression,
          replacementMapForHoistingMap
        );
        replacementMapForHoistingMap.set(
          new HighIRExpressionWrapper(hoistedExpression),
          newTemporary
        );
        return [newTemporary, simplifiedHoistedExpression] as const;
      })
      .sort((a, b) => {
        // b must be after a, since b uses the hoisted temporary defined in a.
        if (expressionContainsTemporary(b[1], a[0])) return -1;
        // 1: a must be after b, since a uses the hoisted temporary defined in b.
        // 0: No dependency. Don't care about order
        // istanbul ignore next
        return expressionContainsTemporary(a[1], b[0]) ? 1 : 0;
      });
  });

  return { hoistingLists, replacementMaps };
};

const optimizeIRWithCommonSubExpressionElimination = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator
): readonly MidIRStatement[] => {
  const { hoistingLists, replacementMaps } = computeHoistingListAndReplacementMap(
    statements,
    allocator
  );

  const newStatements: MidIRStatement[] = [];
  statements.forEach((statement, index) => {
    checkNotNull(hoistingLists[index]).forEach(([temporary, hoistedExpression]) => {
      newStatements.push(MIR_MOVE_TEMP(temporary, hoistedExpression));
    });
    newStatements.push(
      rewriteStatementByReplacingExpressionByHoistedTemporary(
        statement,
        checkNotNull(replacementMaps[index])
      )
    );
  });
  return newStatements;
};

export default optimizeIRWithCommonSubExpressionElimination;
