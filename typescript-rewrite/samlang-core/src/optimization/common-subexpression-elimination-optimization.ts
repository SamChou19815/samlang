import analyzeAvailableExpressionsComingOutAtEachStatement from '../analysis/available-expressions-analysis';
import { MidIRExpression, MidIRStatement, midIRExpressionToString } from '../ast/mir';
import { assertNotNull } from '../util/type-assertions';

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
  statement: MidIRStatement,
  availableExpressions: readonly string[]
): ReadonlySet<string> => {
  const collector = new Set<string>();

  const searchAndCollect = (expressionToSearch: MidIRExpression): void => {
    if (expressionIsSimple(expressionToSearch) || availableExpressions.length === 0) {
      return;
    }
    const expressionToSearchString = midIRExpressionToString(expressionToSearch);
    availableExpressions.forEach((availableExpression) => {
      if (expressionToSearchString === availableExpression) {
        collector.add(expressionToSearchString);
      }
    });

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
): ReadonlyMap<string, ExpressionUsageAndFirstAppears> => {
  const availableExpressionAnalysisResult = analyzeAvailableExpressionsComingOutAtEachStatement(
    statements
  );

  const map: Record<string, [Set<number>, Set<number>]> = {};
  statements.forEach((statement, index) => {
    const analysisResultForStatement = availableExpressionAnalysisResult[index];

    analysisResultForStatement.forEach((apperances, expressionWrapper) => {
      const expression = expressionWrapper.uniqueHash();
      const appearsAndUses = map[expression];
      if (appearsAndUses == null) {
        map[expression] = [new Set(apperances), new Set()];
      } else {
        apperances.forEach((appearId) => appearsAndUses[0].add(appearId));
      }
    });

    collectExpressionUsages(
      statement,
      analysisResultForStatement.entries().map((it) => it[0].uniqueHash())
    ).forEach((expression) => {
      const appearsAndUses = map[expression];
      assertNotNull(appearsAndUses);
      // istanbul ignore next
      if (appearsAndUses == null) {
        // istanbul ignore next
        map[expression] = [new Set(), new Set([index])];
      } else {
        appearsAndUses[1].add(index);
      }
    });
  });

  return new Map(
    Object.entries(map).map(([expression, pair]) => [
      expression,
      { appears: pair[0], usage: pair[1] },
    ])
  );
};
