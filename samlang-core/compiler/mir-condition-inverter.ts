import {
  MidIRExpression,
  midIRExpressionToString,
  MIR_ZERO,
  MIR_ONE,
  MIR_OP,
} from 'samlang-core-ast/mir-nodes';

/**
 * Invert the condition in the most efficient way.
 *
 * @param expression the condition expression to invert.
 * @return the inverted condition expression.
 * @throws when the expression can't possibly be a boolean expression.
 */
const invertMidIRConditionExpression = (expression: MidIRExpression): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression': {
      const value = expression.value;
      if (value === BigInt(0)) {
        return MIR_ONE;
      }
      if (value === BigInt(1)) {
        return MIR_ZERO;
      }
      throw new Error(`Bad node: ${midIRExpressionToString(expression)}`);
    }
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
    case 'MidIRImmutableMemoryExpression':
      // Not statically decidable, simply apply NOT.
      return MIR_OP('^', expression, MIR_ONE);
    case 'MidIRBinaryExpression': {
      const { operator, e1, e2 } = expression;
      switch (operator) {
        case '*':
        case '/':
        case '%':
        case '+':
        case '-':
          throw new Error(`Bad node: ${midIRExpressionToString(expression)}`);
        case '^':
          if (e1.__type__ === 'MidIRConstantExpression' && e1.value === MIR_ONE.value) {
            return e2;
          }
          if (e2.__type__ === 'MidIRConstantExpression' && e2.value === MIR_ONE.value) {
            return e1;
          }
          return MIR_OP('^', expression, MIR_ONE);
        case '<':
          return MIR_OP('>=', e1, e2);
        case '<=':
          return MIR_OP('>', e1, e2);
        case '>':
          return MIR_OP('<=', e1, e2);
        case '>=':
          return MIR_OP('<', e1, e2);
        case '==':
          return MIR_OP('!=', e1, e2);
        case '!=':
          return MIR_OP('==', e1, e2);
      }
    }
  }
};

export default invertMidIRConditionExpression;
