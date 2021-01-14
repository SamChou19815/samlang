import createHighIRFlexibleOrderOperatorNode from '../hir-flexible-op';

import { HIR_ZERO, HIR_ONE, HIR_NAME, HIR_VARIABLE } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('createMidIRFlexibleOrderOperatorNode test', () => {
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_ONE)).toEqual({
    operator: '+',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_ZERO)).toEqual({
    operator: '+',
    e1: HIR_ZERO,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ONE, HIR_ZERO)).toEqual({
    operator: '+',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_NAME('', HIR_INT_TYPE))).toEqual({
    operator: '+',
    e1: HIR_NAME('', HIR_INT_TYPE),
    e2: HIR_ZERO,
  });
  expect(
    createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_VARIABLE('', HIR_INT_TYPE))
  ).toEqual({ operator: '+', e1: HIR_VARIABLE('', HIR_INT_TYPE), e2: HIR_ZERO });

  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_NAME('', HIR_INT_TYPE), HIR_ZERO)).toEqual({
    operator: '+',
    e1: HIR_NAME('', HIR_INT_TYPE),
    e2: HIR_ZERO,
  });
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_NAME('a', HIR_INT_TYPE),
      HIR_NAME('b', HIR_INT_TYPE)
    )
  ).toEqual({ operator: '+', e1: HIR_NAME('b', HIR_INT_TYPE), e2: HIR_NAME('a', HIR_INT_TYPE) });
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_NAME('', HIR_INT_TYPE),
      HIR_VARIABLE('', HIR_INT_TYPE)
    )
  ).toEqual({
    operator: '+',
    e1: HIR_VARIABLE('', HIR_INT_TYPE),
    e2: HIR_NAME('', HIR_INT_TYPE),
  });

  expect(
    createHighIRFlexibleOrderOperatorNode('+', HIR_VARIABLE('', HIR_INT_TYPE), HIR_ZERO)
  ).toEqual({ operator: '+', e1: HIR_VARIABLE('', HIR_INT_TYPE), e2: HIR_ZERO });
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_VARIABLE('a', HIR_INT_TYPE),
      HIR_NAME('b', HIR_INT_TYPE)
    )
  ).toEqual({
    operator: '+',
    e1: HIR_VARIABLE('a', HIR_INT_TYPE),
    e2: HIR_NAME('b', HIR_INT_TYPE),
  });
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_VARIABLE('a', HIR_INT_TYPE),
      HIR_VARIABLE('b', HIR_INT_TYPE)
    )
  ).toEqual({
    operator: '+',
    e1: HIR_VARIABLE('b', HIR_INT_TYPE),
    e2: HIR_VARIABLE('a', HIR_INT_TYPE),
  });
});
