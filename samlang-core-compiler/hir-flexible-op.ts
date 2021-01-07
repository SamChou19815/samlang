import type { IROperator } from 'samlang-core-ast/common-operators';
import { HighIRExpression, HIR_BINARY } from 'samlang-core-ast/hir-expressions';
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
        case 'HighIRIndexAccessExpression':
        case 'HighIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'HighIRNameExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression':
          return 1;
        case 'HighIRNameExpression':
          return e1.name.localeCompare(e2.name);
        case 'HighIRVariableExpression':
        case 'HighIRIndexAccessExpression':
        case 'HighIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'HighIRVariableExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression':
        case 'HighIRNameExpression':
          return 1;
        case 'HighIRVariableExpression':
          return e1.name.localeCompare(e2.name);
        case 'HighIRIndexAccessExpression':
          return -1;
        case 'HighIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'HighIRIndexAccessExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression':
        case 'HighIRNameExpression':
        case 'HighIRVariableExpression':
          return 1;
        case 'HighIRIndexAccessExpression': {
          const c = compareMidIR(e1.expression, e2.expression);
          return c === 0 ? e1.index - e2.index : c;
        }
        case 'HighIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'HighIRBinaryExpression':
      switch (e2.__type__) {
        case 'HighIRIntLiteralExpression':
        case 'HighIRNameExpression':
        case 'HighIRVariableExpression':
        case 'HighIRIndexAccessExpression':
          return 1;
        case 'HighIRBinaryExpression': {
          const operatorCompareResult = e1.operator.localeCompare(e2.operator);
          if (operatorCompareResult !== 0) {
            return operatorCompareResult;
          }
          const e1CompareResult = compareMidIR(e1.e1, e2.e1);
          if (e1CompareResult !== 0) {
            return e1CompareResult;
          }
          return compareMidIR(e1.e2, e2.e2);
        }
      }
  }
};

/**
 * Some OPs are commutative.
 * We can standardize them into one canonical form,
 * so that we can do a simple equality check in later optimization stages.
 */
const createHighIRFlexibleOrderOperatorNode = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => {
  switch (operator) {
    case '+':
    case '*':
    case '==':
    case '!=':
      return compareMidIR(e1, e2) > 0
        ? HIR_BINARY({ operator, e1, e2 })
        : HIR_BINARY({ operator, e2: e1, e1: e2 });
    default:
      return HIR_BINARY({ operator, e1, e2 });
  }
};

export default createHighIRFlexibleOrderOperatorNode;
