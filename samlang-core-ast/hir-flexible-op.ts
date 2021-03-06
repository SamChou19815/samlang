import type { IROperator } from './common-operators';
import { HighIRExpression, HIR_BINARY } from './hir-expressions';

import { Long } from 'samlang-core-utils';

/**
 * Compare two Mid IR expression.
 * The order itself has no semantic meaning.
 * We just need a way to compare to define a canonical order.
 */
const compareMidIR = (e1: HighIRExpression, e2: HighIRExpression): number => {
  switch (e1.__type__) {
    case 'HighIRIntLiteralExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression': {
          const diff = e1.value.subtract(e2.value);
          if (diff.equals(Long.ZERO)) {
            return 0;
          }
          return diff.greaterThan(Long.ZERO) ? 1 : -1;
        }
        case 'HighIRNameExpression':
        case 'HighIRVariableExpression':
          return -1;
      }
    case 'HighIRNameExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression':
          return 1;
        case 'HighIRNameExpression':
          return e1.name.localeCompare(e2.name);
        case 'HighIRVariableExpression':
          return -1;
      }
    case 'HighIRVariableExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression':
        case 'HighIRNameExpression':
          return 1;
        case 'HighIRVariableExpression':
          return e1.name.localeCompare(e2.name);
      }
  }
};

/**
 * Some OPs are commutative.
 * We can standardize them into one canonical form,
 * so that we can do a simple equality check in later optimization stages.
 */
const createHighIRFlexibleOrderOperatorNode = (
  highIROperator: IROperator,
  expression1: HighIRExpression,
  expression2: HighIRExpression
): Readonly<{ operator: IROperator; e1: HighIRExpression; e2: HighIRExpression }> => {
  const { operator, e1, e2 } = HIR_BINARY({
    name: '',
    operator: highIROperator,
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

export default createHighIRFlexibleOrderOperatorNode;
