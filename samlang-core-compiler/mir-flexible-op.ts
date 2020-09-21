import type { IROperator } from 'samlang-core-ast/common-operators';
import { MidIRExpression, MIR_OP } from 'samlang-core-ast/mir-nodes';

/**
 * Compare two Mid IR expression.
 * The order itself has no semantic meaning.
 * We just need a way to compare to define a canonical order.
 */
const compareMidIR = (e1: MidIRExpression, e2: MidIRExpression): number => {
  switch (e1.__type__) {
    case 'MidIRConstantExpression':
      switch (e2.__type__) {
        case 'MidIRConstantExpression': {
          const diff = e1.value - e2.value;
          if (diff === BigInt(0)) {
            return 0;
          }
          return diff > BigInt(0) ? 1 : -1;
        }
        case 'MidIRNameExpression':
        case 'MidIRTemporaryExpression':
        case 'MidIRImmutableMemoryExpression':
        case 'MidIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'MidIRNameExpression':
      switch (e2.__type__) {
        case 'MidIRConstantExpression':
          return 1;
        case 'MidIRNameExpression':
          return e1.name.localeCompare(e2.name);
        case 'MidIRTemporaryExpression':
        case 'MidIRImmutableMemoryExpression':
        case 'MidIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'MidIRTemporaryExpression':
      switch (e2.__type__) {
        case 'MidIRConstantExpression':
        case 'MidIRNameExpression':
          return 1;
        case 'MidIRTemporaryExpression':
          return e1.temporaryID.localeCompare(e2.temporaryID);
        case 'MidIRImmutableMemoryExpression':
          return -1;
        case 'MidIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'MidIRImmutableMemoryExpression':
      switch (e2.__type__) {
        case 'MidIRConstantExpression':
        case 'MidIRNameExpression':
        case 'MidIRTemporaryExpression':
          return 1;
        case 'MidIRImmutableMemoryExpression':
          return compareMidIR(e1.indexExpression, e2.indexExpression);
        case 'MidIRBinaryExpression':
          return -1;
      }
    // eslint-disable-next-line no-fallthrough
    case 'MidIRBinaryExpression':
      switch (e2.__type__) {
        case 'MidIRConstantExpression':
        case 'MidIRNameExpression':
        case 'MidIRTemporaryExpression':
        case 'MidIRImmutableMemoryExpression':
          return 1;
        case 'MidIRBinaryExpression': {
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
const createMidIRFlexibleOrderOperatorNode = (
  operator: IROperator,
  e1: MidIRExpression,
  e2: MidIRExpression
): MidIRExpression => {
  switch (operator) {
    case '+':
    case '*':
    case '==':
    case '!=':
      return compareMidIR(e1, e2) > 0 ? MIR_OP(operator, e1, e2) : MIR_OP(operator, e2, e1);
    default:
      return MIR_OP(operator, e1, e2);
  }
};

export default createMidIRFlexibleOrderOperatorNode;
