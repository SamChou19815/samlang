import analyzeLocalValueNumberingAssignment, {
  ReadonlyLocalNumberingInformation,
} from '../analysis/local-value-numbering-analysis';

import {
  MidIRStatement,
  MidIRExpression,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
} from 'samlang-core-ast/mir-nodes';

const rewriteMidIRExpressionWithLocalValueNumberingInformation = (
  information: ReadonlyLocalNumberingInformation,
  expression: MidIRExpression
): MidIRExpression => {
  const replacement = information.getTemporaryReplacementForExpression(expression);
  if (replacement != null) return replacement;

  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return expression;
    case 'MidIRImmutableMemoryExpression':
      return MIR_IMMUTABLE_MEM(
        rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          expression.indexExpression
        )
      );
    case 'MidIRBinaryExpression':
      return MIR_OP(
        expression.operator,
        rewriteMidIRExpressionWithLocalValueNumberingInformation(information, expression.e1),
        rewriteMidIRExpressionWithLocalValueNumberingInformation(information, expression.e2)
      );
  }
};

const rewriteMidIRStatementWithLocalValueNumberingInformation = (
  information: ReadonlyLocalNumberingInformation,
  statement: MidIRStatement
): MidIRStatement => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return {
        ...statement,
        source: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          statement.source
        ),
      };
    case 'MidIRMoveMemStatement':
      return {
        ...statement,
        memoryIndexExpression: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          statement.memoryIndexExpression
        ),
        source: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          statement.source
        ),
      };
    case 'MidIRCallFunctionStatement':
      return {
        ...statement,
        functionExpression: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          statement.functionExpression
        ),
        functionArguments: statement.functionArguments.map((it) =>
          rewriteMidIRExpressionWithLocalValueNumberingInformation(information, it)
        ),
      };
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return statement;
    case 'MidIRConditionalJumpFallThrough':
      return {
        ...statement,
        conditionExpression: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          statement.conditionExpression
        ),
      };
    case 'MidIRReturnStatement':
      if (statement.returnedExpression == null) return statement;
      return {
        ...statement,
        returnedExpression: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          statement.returnedExpression
        ),
      };
  }
};

const optimizeIRWithLocalValueNumbering = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const result = analyzeLocalValueNumberingAssignment(statements);
  return statements.map((statement, index) =>
    rewriteMidIRStatementWithLocalValueNumberingInformation(result[index], statement)
  );
};

export default optimizeIRWithLocalValueNumbering;
