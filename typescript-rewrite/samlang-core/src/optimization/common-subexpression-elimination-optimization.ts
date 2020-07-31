import analyzeAvailableExpressionsComingOutAtEachStatement, {
  MidIRExpressionWrapper,
} from '../analysis/available-expressions-analysis';
import { MidIRExpression, MidIRStatement } from '../ast/mir';
import { ReadonlyHashMap, ReadonlyHashSet, hashMapOf, hashSetOf } from '../util/collections';
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
