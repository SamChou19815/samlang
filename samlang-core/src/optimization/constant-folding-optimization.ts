import {
  MidIRStatement,
  MidIRExpression,
  MIR_ONE,
  MIR_ZERO,
  MIR_CONST,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_RETURN,
  MIR_JUMP,
  MIR_CJUMP_FALLTHROUGH,
} from '../ast/mir';
import { isNotNull } from '../util/type-assertions';

export const constantFoldExpression = (expression: MidIRExpression): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return expression;
    case 'MidIRImmutableMemoryExpression':
      return MIR_IMMUTABLE_MEM(constantFoldExpression(expression.indexExpression));
    case 'MidIRBinaryExpression': {
      const e1 = constantFoldExpression(expression.e1);
      const e2 = constantFoldExpression(expression.e2);
      if (e1.__type__ !== 'MidIRConstantExpression' || e2.__type__ !== 'MidIRConstantExpression') {
        return MIR_OP(expression.operator, e1, e2);
      }
      const v1 = e1.value;
      const v2 = e2.value;
      switch (expression.operator) {
        case '+':
          return MIR_CONST(v1 + v2);
        case '-':
          return MIR_CONST(v1 - v2);
        case '*':
          return MIR_CONST(v1 * v2);
        case '/':
          if (v2 === BigInt(0)) {
            return MIR_OP(expression.operator, e1, e2);
          }
          return MIR_CONST(v1 / v2);
        case '%':
          if (v2 === BigInt(0)) {
            return MIR_OP(expression.operator, e1, e2);
          }
          return MIR_CONST(v1 % v2);
        case '^':
          // eslint-disable-next-line no-bitwise
          return MIR_CONST(v1 ^ v2);
        case '<':
          return v1 < v2 ? MIR_ONE : MIR_ZERO;
        case '<=':
          return v1 <= v2 ? MIR_ONE : MIR_ZERO;
        case '>':
          return v1 > v2 ? MIR_ONE : MIR_ZERO;
        case '>=':
          return v1 >= v2 ? MIR_ONE : MIR_ZERO;
        case '==':
          return v1 === v2 ? MIR_ONE : MIR_ZERO;
        case '!=':
          return v1 === v2 ? MIR_ZERO : MIR_ONE;
      }
    }
  }
};

const constantFoldStatement = (statement: MidIRStatement): MidIRStatement | null => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return MIR_MOVE_TEMP(
        MIR_TEMP(statement.temporaryID),
        constantFoldExpression(statement.source)
      );
    case 'MidIRMoveMemStatement':
      return MIR_MOVE_IMMUTABLE_MEM(
        MIR_IMMUTABLE_MEM(constantFoldExpression(statement.memoryIndexExpression)),
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
      return MIR_RETURN(
        statement.returnedExpression == null
          ? undefined
          : constantFoldExpression(statement.returnedExpression)
      );
    case 'MidIRConditionalJumpFallThrough': {
      const condition = constantFoldExpression(statement.conditionExpression);
      if (condition.__type__ !== 'MidIRConstantExpression') {
        return MIR_CJUMP_FALLTHROUGH(condition, statement.label1);
      }
      // Directly fallthrough.
      if (condition.value === BigInt(0)) return null;
      // Directly go to true label.
      return MIR_JUMP(statement.label1);
    }
  }
};

const optimizeIRWithConstantFolding = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => statements.map(constantFoldStatement).filter(isNotNull);

export default optimizeIRWithConstantFolding;
