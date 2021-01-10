import analyzeAvailableCopies from 'samlang-core-analysis/available-copy-analysis';
import {
  MidIRExpression,
  MidIRStatement,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const replaceMidIRExpressionAccordingToAvailableCopies = (
  availableCopies: Readonly<Record<string, string>>,
  expression: MidIRExpression
): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
      return expression;
    case 'MidIRTemporaryExpression':
      return MIR_TEMP(availableCopies[expression.name] ?? expression.name);
    case 'MidIRImmutableMemoryExpression':
      return MIR_IMMUTABLE_MEM(
        replaceMidIRExpressionAccordingToAvailableCopies(
          availableCopies,
          expression.indexExpression
        )
      );
    case 'MidIRBinaryExpression':
      return MIR_OP(
        expression.operator,
        replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, expression.e1),
        replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, expression.e2)
      );
  }
};

const rewriteMidIRStatementAccordingToAvailableCopies = (
  availableCopies: Readonly<Record<string, string>>,
  statement: MidIRStatement
): MidIRStatement => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return {
        ...statement,
        source: replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, statement.source),
      };
    case 'MidIRMoveMemStatement':
      return {
        ...statement,
        memoryIndexExpression: replaceMidIRExpressionAccordingToAvailableCopies(
          availableCopies,
          statement.memoryIndexExpression
        ),
        source: replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, statement.source),
      };
    case 'MidIRCallFunctionStatement':
      return {
        ...statement,
        functionExpression: replaceMidIRExpressionAccordingToAvailableCopies(
          availableCopies,
          statement.functionExpression
        ),
        functionArguments: statement.functionArguments.map((it) =>
          replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, it)
        ),
      };
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return statement;
    case 'MidIRConditionalJumpFallThrough':
      return {
        ...statement,
        conditionExpression: replaceMidIRExpressionAccordingToAvailableCopies(
          availableCopies,
          statement.conditionExpression
        ),
      };
    case 'MidIRReturnStatement':
      return MIR_RETURN(
        replaceMidIRExpressionAccordingToAvailableCopies(
          availableCopies,
          statement.returnedExpression
        )
      );
  }
};

const optimizeIRWithCopyPropagation = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const availableCopies = analyzeAvailableCopies(statements);
  return statements.map((statement, index) =>
    rewriteMidIRStatementAccordingToAvailableCopies(checkNotNull(availableCopies[index]), statement)
  );
};

export default optimizeIRWithCopyPropagation;
