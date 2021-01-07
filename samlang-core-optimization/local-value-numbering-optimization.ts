import analyzeLocalValueNumberingAssignment, {
  ReadonlyLocalNumberingInformation,
} from 'samlang-core-analysis/local-value-numbering-analysis';
import { HighIRExpression, HIR_INDEX_ACCESS, HIR_BINARY } from 'samlang-core-ast/hir-expressions';
import type { MidIRStatement } from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const rewriteMidIRExpressionWithLocalValueNumberingInformation = (
  information: ReadonlyLocalNumberingInformation,
  expression: HighIRExpression
): HighIRExpression => {
  const replacement = information.getTemporaryReplacementForExpression(expression);
  if (replacement != null) return replacement;

  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
      return expression;
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: rewriteMidIRExpressionWithLocalValueNumberingInformation(
          information,
          expression.expression
        ),
        index: expression.index,
      });
    case 'HighIRBinaryExpression':
      return HIR_BINARY({
        operator: expression.operator,
        e1: rewriteMidIRExpressionWithLocalValueNumberingInformation(information, expression.e1),
        e2: rewriteMidIRExpressionWithLocalValueNumberingInformation(information, expression.e2),
      });
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
    rewriteMidIRStatementWithLocalValueNumberingInformation(checkNotNull(result[index]), statement)
  );
};

export default optimizeIRWithLocalValueNumbering;
