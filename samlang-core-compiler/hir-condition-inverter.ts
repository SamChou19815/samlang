import createHighIRFlexibleOrderOperatorNode from './hir-flexible-op';

import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  debugPrintHighIRExpressionUntyped,
} from 'samlang-core-ast/hir-expressions';
import { Long } from 'samlang-core-utils';

/**
 * Invert the condition in the most efficient way.
 *
 * @param expression the condition expression to invert.
 * @return the inverted condition expression.
 * @throws when the expression can't possibly be a boolean expression.
 */
const invertHighIRConditionExpression = (expression: HighIRExpression): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression': {
      const value = expression.value;
      if (value.equals(Long.ZERO)) {
        return HIR_ONE;
      }
      if (value.equals(Long.ONE)) {
        return HIR_ZERO;
      }
      throw new Error(`Bad node: ${debugPrintHighIRExpressionUntyped(expression)}`);
    }
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
    case 'HighIRIndexAccessExpression':
      // Not statically decidable, simply apply NOT.
      return createHighIRFlexibleOrderOperatorNode('^', expression, HIR_ONE);
    case 'HighIRBinaryExpression': {
      const { operator, e1, e2 } = expression;
      switch (operator) {
        case '*':
        case '/':
        case '%':
        case '+':
        case '-':
          throw new Error(`Bad node: ${debugPrintHighIRExpressionUntyped(expression)}`);
        case '^':
          if (e1.__type__ === 'HighIRIntLiteralExpression' && e1.value === HIR_ONE.value) {
            return e2;
          }
          if (e2.__type__ === 'HighIRIntLiteralExpression' && e2.value === HIR_ONE.value) {
            return e1;
          }
          return createHighIRFlexibleOrderOperatorNode('^', expression, HIR_ONE);
        case '<':
          return createHighIRFlexibleOrderOperatorNode('>=', e1, e2);
        case '<=':
          return createHighIRFlexibleOrderOperatorNode('>', e1, e2);
        case '>':
          return createHighIRFlexibleOrderOperatorNode('<=', e1, e2);
        case '>=':
          return createHighIRFlexibleOrderOperatorNode('<', e1, e2);
        case '==':
          return createHighIRFlexibleOrderOperatorNode('!=', e1, e2);
        case '!=':
          return createHighIRFlexibleOrderOperatorNode('==', e1, e2);
      }
    }
  }
};

export default invertHighIRConditionExpression;
