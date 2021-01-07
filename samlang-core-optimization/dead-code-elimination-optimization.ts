import analyzeLiveTemporariesAtTheEndOfEachStatement from 'samlang-core-analysis/live-temp-analysis';
import type { HighIRExpression } from 'samlang-core-ast/hir-expressions';
import type { MidIRStatement } from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

/** Some expressions might trigger exceptions, removing them changes the behavior of programs. */
const isMidIRExpressionUnsafeToRemove = (expression: HighIRExpression): boolean => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
      return false;
    case 'HighIRBinaryExpression':
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
    case 'HighIRIndexAccessExpression':
      return isMidIRExpressionUnsafeToRemove(expression.expression);
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
    if (checkNotNull(liveTemporariesAtTheEndOfEachStatement[index]).has(statement.temporaryID)) {
      return true;
    }
    return isMidIRExpressionUnsafeToRemove(statement.source);
  });
};

export default optimizeIRWithDeadCodeElimination;
