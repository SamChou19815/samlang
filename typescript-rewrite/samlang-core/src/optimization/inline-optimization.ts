import { MidIRExpression, MidIRStatement, MidIRFunction } from '../ast/mir';

const estimateMidIRExpressionInlineCost = (expression: MidIRExpression): number => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return 0;
    case 'MidIRImmutableMemoryExpression':
      return 1 + estimateMidIRExpressionInlineCost(expression.indexExpression);
    case 'MidIRBinaryExpression':
      return (
        1 +
        estimateMidIRExpressionInlineCost(expression.e1) +
        estimateMidIRExpressionInlineCost(expression.e2)
      );
  }
};

const estimateMidIRStatementInlineCost = (statement: MidIRStatement): number => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return estimateMidIRExpressionInlineCost(statement.source);
    case 'MidIRMoveMemStatement':
      return (
        1 +
        estimateMidIRExpressionInlineCost(statement.memoryIndexExpression) +
        estimateMidIRExpressionInlineCost(statement.source)
      );
    case 'MidIRCallFunctionStatement': {
      let sum = 5;
      sum += estimateMidIRExpressionInlineCost(statement.functionExpression);
      statement.functionArguments.forEach((it) => {
        sum += 1 + estimateMidIRExpressionInlineCost(it);
      });
      return sum;
    }
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return 1;
    case 'MidIRConditionalJumpFallThrough':
      return 1 + estimateMidIRExpressionInlineCost(statement.conditionExpression);
    case 'MidIRReturnStatement':
      return (
        1 +
        (statement.returnedExpression == null
          ? 0
          : estimateMidIRExpressionInlineCost(statement.returnedExpression))
      );
  }
};

// eslint-disable-next-line camelcase, import/prefer-default-export
export const estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING = (
  midIRFunction: MidIRFunction
): number => {
  let sum = 0;
  midIRFunction.mainBodyStatements.forEach((statement) => {
    sum += estimateMidIRStatementInlineCost(statement);
  });
  return sum;
};
