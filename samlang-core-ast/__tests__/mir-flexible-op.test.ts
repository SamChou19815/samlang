import createMidIRFlexibleOrderOperatorNode from '../mir-flexible-op';
import { MIR_ZERO, MIR_ONE, MIR_NAME, MIR_VARIABLE, MIR_INT_TYPE } from '../mir-nodes';

it('createMidIRFlexibleOrderOperatorNode test', () => {
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_ONE)).toEqual({
    operator: '+',
    e1: MIR_ONE,
    e2: MIR_ZERO,
  });
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_ZERO)).toEqual({
    operator: '+',
    e1: MIR_ZERO,
    e2: MIR_ZERO,
  });
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ONE, MIR_ZERO)).toEqual({
    operator: '+',
    e1: MIR_ONE,
    e2: MIR_ZERO,
  });
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_NAME('', MIR_INT_TYPE))).toEqual({
    operator: '+',
    e1: MIR_NAME('', MIR_INT_TYPE),
    e2: MIR_ZERO,
  });
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_VARIABLE('', MIR_INT_TYPE))
  ).toEqual({ operator: '+', e1: MIR_VARIABLE('', MIR_INT_TYPE), e2: MIR_ZERO });

  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_NAME('', MIR_INT_TYPE), MIR_ZERO)).toEqual({
    operator: '+',
    e1: MIR_NAME('', MIR_INT_TYPE),
    e2: MIR_ZERO,
  });
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_NAME('a', MIR_INT_TYPE),
      MIR_NAME('b', MIR_INT_TYPE)
    )
  ).toEqual({ operator: '+', e1: MIR_NAME('b', MIR_INT_TYPE), e2: MIR_NAME('a', MIR_INT_TYPE) });
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_NAME('', MIR_INT_TYPE),
      MIR_VARIABLE('', MIR_INT_TYPE)
    )
  ).toEqual({
    operator: '+',
    e1: MIR_VARIABLE('', MIR_INT_TYPE),
    e2: MIR_NAME('', MIR_INT_TYPE),
  });

  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_VARIABLE('', MIR_INT_TYPE), MIR_ZERO)
  ).toEqual({ operator: '+', e1: MIR_VARIABLE('', MIR_INT_TYPE), e2: MIR_ZERO });
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_VARIABLE('a', MIR_INT_TYPE),
      MIR_NAME('b', MIR_INT_TYPE)
    )
  ).toEqual({
    operator: '+',
    e1: MIR_VARIABLE('a', MIR_INT_TYPE),
    e2: MIR_NAME('b', MIR_INT_TYPE),
  });
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_VARIABLE('a', MIR_INT_TYPE),
      MIR_VARIABLE('b', MIR_INT_TYPE)
    )
  ).toEqual({
    operator: '+',
    e1: MIR_VARIABLE('b', MIR_INT_TYPE),
    e2: MIR_VARIABLE('a', MIR_INT_TYPE),
  });
});
