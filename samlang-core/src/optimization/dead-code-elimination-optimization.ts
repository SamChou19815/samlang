import analyzeLiveTemporariesAtTheEndOfEachStatement from '../analysis/live-temp-analysis';
import type { MidIRStatement, MidIRExpression } from '../ast/mir-nodes';

/** Some expressions might trigger exceptions, removing them changes the behavior of programs. */
const isMidIRExpressionUnsafeToRemove = (expression: MidIRExpression): boolean => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRTemporaryExpression':
    case 'MidIRNameExpression':
      return false;
    case 'MidIRBinaryExpression':
      switch (expression.operator) {
        case '/':
        case '%':
          return true;
        default:
          return (
            isMidIRExpressionUnsafeToRemove(expression.e1) ||
            isMidIRExpressionUnsafeToRemove(expression.e2)
          );
      }
    case 'MidIRImmutableMemoryExpression':
      return isMidIRExpressionUnsafeToRemove(expression.indexExpression);
  }
};

const optimizeIRWithDeadCodeElimination = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const liveTemporariesAtTheEndOfEachStatement = analyzeLiveTemporariesAtTheEndOfEachStatement(
    statements
  );
  return statements.filter((statement, index) => {
    if (statement.__type__ !== 'MidIRMoveTempStatement') return true;
    if (liveTemporariesAtTheEndOfEachStatement[index].has(statement.temporaryID)) return true;
    return isMidIRExpressionUnsafeToRemove(statement.source);
  });
};

export default optimizeIRWithDeadCodeElimination;
