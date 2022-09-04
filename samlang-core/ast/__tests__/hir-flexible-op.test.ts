import createHighIRFlexibleOrderOperatorNode from '../hir-flexible-op';
import { HIR_INT_TYPE, HIR_ONE, HIR_STRING_NAME, HIR_VARIABLE, HIR_ZERO } from '../hir-nodes';

describe('hir-flexible-op', () => {
  it('createHighIRFlexibleOrderOperatorNode test', () => {
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
    expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_STRING_NAME(''))).toEqual({
      operator: '+',
      e1: HIR_STRING_NAME(''),
      e2: HIR_ZERO,
    });
    expect(
      createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_VARIABLE('', HIR_INT_TYPE)),
    ).toEqual({ operator: '+', e1: HIR_VARIABLE('', HIR_INT_TYPE), e2: HIR_ZERO });

    expect(createHighIRFlexibleOrderOperatorNode('+', HIR_STRING_NAME(''), HIR_ZERO)).toEqual({
      operator: '+',
      e1: HIR_STRING_NAME(''),
      e2: HIR_ZERO,
    });
    expect(
      createHighIRFlexibleOrderOperatorNode('+', HIR_STRING_NAME('a'), HIR_STRING_NAME('b')),
    ).toEqual({ operator: '+', e1: HIR_STRING_NAME('b'), e2: HIR_STRING_NAME('a') });
    expect(
      createHighIRFlexibleOrderOperatorNode(
        '+',
        HIR_STRING_NAME(''),
        HIR_VARIABLE('', HIR_INT_TYPE),
      ),
    ).toEqual({
      operator: '+',
      e1: HIR_VARIABLE('', HIR_INT_TYPE),
      e2: HIR_STRING_NAME(''),
    });

    expect(
      createHighIRFlexibleOrderOperatorNode('+', HIR_VARIABLE('', HIR_INT_TYPE), HIR_ZERO),
    ).toEqual({ operator: '+', e1: HIR_VARIABLE('', HIR_INT_TYPE), e2: HIR_ZERO });
    expect(
      createHighIRFlexibleOrderOperatorNode(
        '+',
        HIR_VARIABLE('a', HIR_INT_TYPE),
        HIR_STRING_NAME('b'),
      ),
    ).toEqual({
      operator: '+',
      e1: HIR_VARIABLE('a', HIR_INT_TYPE),
      e2: HIR_STRING_NAME('b'),
    });
    expect(
      createHighIRFlexibleOrderOperatorNode(
        '+',
        HIR_VARIABLE('a', HIR_INT_TYPE),
        HIR_VARIABLE('b', HIR_INT_TYPE),
      ),
    ).toEqual({
      operator: '+',
      e1: HIR_VARIABLE('b', HIR_INT_TYPE),
      e2: HIR_VARIABLE('a', HIR_INT_TYPE),
    });
  });

  expect(createHighIRFlexibleOrderOperatorNode('<', HIR_ZERO, HIR_ONE)).toEqual({
    operator: '>',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('<', HIR_ONE, HIR_ZERO)).toEqual({
    operator: '<',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('<=', HIR_ZERO, HIR_ONE)).toEqual({
    operator: '>=',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('<=', HIR_ONE, HIR_ZERO)).toEqual({
    operator: '<=',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('>', HIR_ZERO, HIR_ONE)).toEqual({
    operator: '<',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('>', HIR_ONE, HIR_ZERO)).toEqual({
    operator: '>',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('>=', HIR_ZERO, HIR_ONE)).toEqual({
    operator: '<=',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('>=', HIR_ONE, HIR_ZERO)).toEqual({
    operator: '>=',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
  expect(createHighIRFlexibleOrderOperatorNode('/', HIR_ONE, HIR_ZERO)).toEqual({
    operator: '/',
    e1: HIR_ONE,
    e2: HIR_ZERO,
  });
});
