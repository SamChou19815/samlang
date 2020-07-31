import analyzeAvailableExpressionsComingOutAtEachStatement, {
  MidIRExpressionWrapper,
} from '../analysis/available-expressions-analysis';
import { MidIRExpression, MidIRStatement, MIR_TEMP, MIR_MOVE_TEMP } from '../ast/mir';
import { ReadonlyHashMap, ReadonlyHashSet, hashMapOf, hashSetOf } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';
import OptimizationResourceAllocator from './optimization-resource-allocator';

const expressionIsPrimitive = (expression: MidIRExpression): boolean =>
  expression.__type__ === 'MidIRConstantExpression' ||
  expression.__type__ === 'MidIRNameExpression' ||
  expression.__type__ === 'MidIRTemporaryExpression';

/** @returns whether the given expression is primitive or a simple add, sub, xor. */
const expressionIsSimple = (expression: MidIRExpression): boolean => {
  if (expressionIsPrimitive(expression)) return true;
  if (expression.__type__ !== 'MidIRBinaryExpression') return false;
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
): ReadonlyHashSet<MidIRExpressionWrapper> => {
  const collector = hashSetOf<MidIRExpressionWrapper>();

  const searchAndCollect = (expressionToSearch: MidIRExpression): void => {
    if (expressionIsSimple(expressionToSearch)) {
      return;
    }
    collector.add(new MidIRExpressionWrapper(expressionToSearch));

    switch (expressionToSearch.__type__) {
      case 'MidIRImmutableMemoryExpression':
        searchAndCollect(expressionToSearch.indexExpression);
        break;
      case 'MidIRBinaryExpression':
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
      if (statement.returnedExpression != null) {
        searchAndCollect(statement.returnedExpression);
      }
      break;
  }

  return collector;
};

type ExpressionUsageAndFirstAppears = {
  readonly appears: ReadonlySet<number>;
  readonly usage: ReadonlySet<number>;
};

// eslint-disable-next-line camelcase, import/prefer-default-export
export const computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING = (
  statements: readonly MidIRStatement[]
): ReadonlyHashMap<MidIRExpressionWrapper, ExpressionUsageAndFirstAppears> => {
  const availableExpressionAnalysisResult = analyzeAvailableExpressionsComingOutAtEachStatement(
    statements
  );

  const map = hashMapOf<MidIRExpressionWrapper, { appears: Set<number>; usage: Set<number> }>();
  statements.forEach((statement, index) => {
    const analysisResultForStatement = availableExpressionAnalysisResult[index];

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
  expression: MidIRExpression,
  replacementMap: ReadonlyHashMap<MidIRExpressionWrapper, string>
): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return expression;
    case 'MidIRImmutableMemoryExpression': {
      const replacement = replacementMap.get(new MidIRExpressionWrapper(expression));
      if (replacement != null) {
        return MIR_TEMP(replacement);
      }
      return {
        ...expression,
        indexExpression: replaceExpressionByHoistedTemporary(
          expression.indexExpression,
          replacementMap
        ),
      };
    }
    case 'MidIRBinaryExpression': {
      const replacement = replacementMap.get(new MidIRExpressionWrapper(expression));
      if (replacement != null) {
        return MIR_TEMP(replacement);
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
  replacementMap: ReadonlyHashMap<MidIRExpressionWrapper, string>
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
      if (statement.returnedExpression == null) {
        return statement;
      }
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
  expression: MidIRExpression,
  temporaryName: string
): boolean => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
      return false;
    case 'MidIRTemporaryExpression':
      return expression.temporaryID === temporaryName;
    case 'MidIRImmutableMemoryExpression':
      return expressionContainsTemporary(expression.indexExpression, temporaryName);
    case 'MidIRBinaryExpression':
      return (
        expressionContainsTemporary(expression.e1, temporaryName) ||
        expressionContainsTemporary(expression.e2, temporaryName)
      );
  }
};

type HoistingListAndReplacementMap = {
  readonly hoistingLists: readonly (readonly [string, MidIRExpression])[][];
  readonly replacementMaps: readonly ReadonlyHashMap<MidIRExpressionWrapper, string>[];
};

const computeHoistingListAndReplacementMap = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator
): HoistingListAndReplacementMap => {
  const globalUsageAndAppearMap = computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING(
    statements
  );
  const hoistingMaps = new Map<number, Map<string, MidIRExpression>>();
  const replacementMaps = statements.map(() => hashMapOf<MidIRExpressionWrapper, string>());

  globalUsageAndAppearMap.forEach((usageAndAppearance, expressionToReplaceWrapper) => {
    if (usageAndAppearance.appears.size < usageAndAppearance.usage.size) {
      // Only hoist expressions when it's used more than it's defined.
      const tempForHoistedExpression = allocator.allocateCSEHoistedTemporary();
      usageAndAppearance.usage.forEach((usagePlace) => {
        replacementMaps[usagePlace].set(expressionToReplaceWrapper, tempForHoistedExpression);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hoistingLists = statements.map((_, index) => {
    const hoistingMap = hoistingMaps.get(index) ?? new Map<string, MidIRExpression>();
    // cleanup hoisting map to avoid repeated computation of sub expressions.
    const replacementMapForHoistingMap = hashMapOf(
      ...Array.from(hoistingMap.entries()).map(
        ([temporary, expression]) => [new MidIRExpressionWrapper(expression), temporary] as const
      )
    );
    return Array.from(hoistingMap.entries())
      .map(([newTemporary, hoistedExpression]) => {
        // Delete mapping to self temporary to avoid trivial replacement.
        replacementMapForHoistingMap.delete(new MidIRExpressionWrapper(hoistedExpression));
        const simplifiedHoistedExpression = replaceExpressionByHoistedTemporary(
          hoistedExpression,
          replacementMapForHoistingMap
        );
        replacementMapForHoistingMap.set(
          new MidIRExpressionWrapper(hoistedExpression),
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
    hoistingLists[index].forEach(([temporary, hoistedExpression]) => {
      newStatements.push(MIR_MOVE_TEMP(MIR_TEMP(temporary), hoistedExpression));
    });
    newStatements.push(
      rewriteStatementByReplacingExpressionByHoistedTemporary(statement, replacementMaps[index])
    );
  });
  return newStatements;
};

export default optimizeIRWithCommonSubExpressionElimination;
