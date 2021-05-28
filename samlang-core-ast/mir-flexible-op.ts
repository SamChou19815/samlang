import type { IROperator } from './common-operators';
import { MidIRExpression, MIR_BINARY } from './mir-nodes';

/**
 * Compare two Mid IR expression.
 * The order itself has no semantic meaning.
 * We just need a way to compare to define a canonical order.
 */
const compareMidIR = (e1: MidIRExpression, e2: MidIRExpression): number => {
  switch (e1.__type__) {
    case 'MidIRIntLiteralExpression':
      switch (e2.__type__) {
        case 'MidIRIntLiteralExpression': {
          const diff = e1.value - e2.value;
          if (diff === 0) {
            return 0;
          }
          return diff >= 0 ? 1 : -1;
        }
        case 'MidIRNameExpression':
        case 'MidIRVariableExpression':
          return -1;
      }
    case 'MidIRNameExpression':
      switch (e2.__type__) {
        case 'MidIRIntLiteralExpression':
          return 1;
        case 'MidIRNameExpression':
          return e1.name.localeCompare(e2.name);
        case 'MidIRVariableExpression':
          return -1;
      }
    case 'MidIRVariableExpression':
      switch (e2.__type__) {
        case 'MidIRIntLiteralExpression':
        case 'MidIRNameExpression':
          return 1;
        case 'MidIRVariableExpression':
          return e1.name.localeCompare(e2.name);
      }
  }
};

/**
 * Some OPs are commutative.
 * We can standardize them into one canonical form,
 * so that we can do a simple equality check in later optimization stages.
 */
const createMidIRFlexibleOrderOperatorNode = (
  irOperator: IROperator,
  expression1: MidIRExpression,
  expression2: MidIRExpression
): Readonly<{ operator: IROperator; e1: MidIRExpression; e2: MidIRExpression }> => {
  const { operator, e1, e2 } = MIR_BINARY({
    name: '',
    operator: irOperator,
    e1: expression1,
    e2: expression2,
  });
  switch (operator) {
    case '+':
    case '*':
    case '==':
    case '!=':
      return compareMidIR(e1, e2) > 0 ? { operator, e1, e2 } : { operator, e2: e1, e1: e2 };
    case '<':
      if (compareMidIR(e1, e2) < 0) return { operator: '>', e1: e2, e2: e1 };
      break;
    case '<=':
      if (compareMidIR(e1, e2) < 0) return { operator: '>=', e1: e2, e2: e1 };
      break;
    case '>':
      if (compareMidIR(e1, e2) < 0) return { operator: '<', e1: e2, e2: e1 };
      break;
    case '>=':
      if (compareMidIR(e1, e2) < 0) return { operator: '<=', e1: e2, e2: e1 };
      break;
    default:
      break;
  }
  return { operator, e1, e2 };
};

export default createMidIRFlexibleOrderOperatorNode;
