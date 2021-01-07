import {
  HighIRExpression,
  HIR_BINARY,
  HIR_FALSE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_TRUE,
} from 'samlang-core-ast/hir-expressions';
import {
  MidIRStatement,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_RETURN,
  MIR_JUMP,
  MIR_CJUMP_FALLTHROUGH,
} from 'samlang-core-ast/mir-nodes';
import { Long, isNotNull } from 'samlang-core-utils';

export const constantFoldExpression = (expression: HighIRExpression): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
      return expression;
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: constantFoldExpression(expression.expression),
        index: expression.index,
      });
    case 'HighIRBinaryExpression': {
      const e1 = constantFoldExpression(expression.e1);
      const e2 = constantFoldExpression(expression.e2);
      if (
        e1.__type__ !== 'HighIRIntLiteralExpression' ||
        e2.__type__ !== 'HighIRIntLiteralExpression'
      ) {
        return HIR_BINARY({ operator: expression.operator, e1, e2 });
      }
      const v1 = e1.value;
      const v2 = e2.value;
      switch (expression.operator) {
        case '+':
          return HIR_INT(v1.add(v2));
        case '-':
          return HIR_INT(v1.subtract(v2));
        case '*':
          return HIR_INT(v1.multiply(v2));
        case '/':
          if (v2.equals(Long.ZERO)) {
            return HIR_BINARY({ operator: expression.operator, e1, e2 });
          }
          return HIR_INT(v1.divide(v2));
        case '%':
          if (v2.equals(Long.ZERO)) {
            return HIR_BINARY({ operator: expression.operator, e1, e2 });
          }
          return HIR_INT(v1.mod(v2));
        case '^':
          return HIR_INT(v1.xor(v2));
        case '<':
          return v1.lessThan(v2) ? HIR_TRUE : HIR_FALSE;
        case '<=':
          return v1.lessThanOrEqual(v2) ? HIR_TRUE : HIR_FALSE;
        case '>':
          return v1.greaterThan(v2) ? HIR_TRUE : HIR_FALSE;
        case '>=':
          return v1.greaterThanOrEqual(v2) ? HIR_TRUE : HIR_FALSE;
        case '==':
          return v1.equals(v2) ? HIR_TRUE : HIR_FALSE;
        case '!=':
          return v1.notEquals(v2) ? HIR_TRUE : HIR_FALSE;
      }
    }
  }
};

const constantFoldStatement = (statement: MidIRStatement): MidIRStatement | null => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return MIR_MOVE_TEMP(statement.temporaryID, constantFoldExpression(statement.source));
    case 'MidIRMoveMemStatement':
      return MIR_MOVE_IMMUTABLE_MEM(
        constantFoldExpression(statement.memoryIndexExpression),
        constantFoldExpression(statement.source)
      );
    case 'MidIRCallFunctionStatement':
      return MIR_CALL_FUNCTION(
        constantFoldExpression(statement.functionExpression),
        statement.functionArguments.map(constantFoldExpression),
        statement.returnCollectorTemporaryID
      );
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return statement;
    case 'MidIRReturnStatement':
      return MIR_RETURN(constantFoldExpression(statement.returnedExpression));
    case 'MidIRConditionalJumpFallThrough': {
      const condition = constantFoldExpression(statement.conditionExpression);
      if (condition.__type__ !== 'HighIRIntLiteralExpression') {
        return MIR_CJUMP_FALLTHROUGH(condition, statement.label1);
      }
      // Directly fallthrough.
      if (condition.value.equals(Long.ZERO)) return null;
      // Directly go to true label.
      return MIR_JUMP(statement.label1);
    }
  }
};

const optimizeIRWithConstantFolding = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => statements.map(constantFoldStatement).filter(isNotNull);

export default optimizeIRWithConstantFolding;
