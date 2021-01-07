import analyzeAvailableCopies from 'samlang-core-analysis/available-copy-analysis';
import {
  HighIRExpression,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { MidIRStatement, MIR_RETURN } from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const replaceMidIRExpressionAccordingToAvailableCopies = (
  availableCopies: Readonly<Record<string, string>>,
  expression: HighIRExpression
): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return expression;
    case 'HighIRVariableExpression':
      return HIR_VARIABLE(availableCopies[expression.name] ?? expression.name, expression.type);
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: replaceMidIRExpressionAccordingToAvailableCopies(
          availableCopies,
          expression.expression
        ),
        index: expression.index,
      });
    case 'HighIRBinaryExpression':
      return HIR_BINARY({
        operator: expression.operator,
        e1: replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, expression.e1),
        e2: replaceMidIRExpressionAccordingToAvailableCopies(availableCopies, expression.e2),
      });
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
