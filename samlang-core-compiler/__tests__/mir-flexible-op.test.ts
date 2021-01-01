import createMidIRFlexibleOrderOperatorNode from '../mir-flexible-op';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_NAME,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
} from 'samlang-core-ast/mir-nodes';

it('createMidIRFlexibleOrderOperatorNode test', () => {
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_ONE)).toEqual(
    MIR_OP('+', MIR_ONE, MIR_ZERO)
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_ZERO)).toEqual(
    MIR_OP('+', MIR_ZERO, MIR_ZERO)
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ONE, MIR_ZERO)).toEqual(
    MIR_OP('+', MIR_ONE, MIR_ZERO)
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_NAME(''))).toEqual(
    MIR_OP('+', MIR_NAME(''), MIR_ZERO)
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_TEMP(''))).toEqual(
    MIR_OP('+', MIR_TEMP(''), MIR_ZERO)
  );
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_IMMUTABLE_MEM(MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_ZERO));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_ZERO, MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_ZERO));

  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_NAME(''), MIR_ZERO)).toEqual(
    MIR_OP('+', MIR_NAME(''), MIR_ZERO)
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_NAME('a'), MIR_NAME('b'))).toEqual(
    MIR_OP('+', MIR_NAME('b'), MIR_NAME('a'))
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_NAME(''), MIR_TEMP(''))).toEqual(
    MIR_OP('+', MIR_TEMP(''), MIR_NAME(''))
  );
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_NAME(''), MIR_IMMUTABLE_MEM(MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_NAME('')));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_NAME(''), MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_NAME('')));

  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_TEMP(''), MIR_ZERO)).toEqual(
    MIR_OP('+', MIR_TEMP(''), MIR_ZERO)
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_TEMP('a'), MIR_NAME('b'))).toEqual(
    MIR_OP('+', MIR_TEMP('a'), MIR_NAME('b'))
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_TEMP('a'), MIR_TEMP('b'))).toEqual(
    MIR_OP('+', MIR_TEMP('b'), MIR_TEMP('a'))
  );
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_TEMP(''), MIR_IMMUTABLE_MEM(MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_TEMP('')));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_TEMP(''), MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_TEMP('')));

  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_ZERO)
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_ZERO));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_NAME('b'))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_NAME('b')));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_TEMP('b'))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_TEMP('b')));
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_IMMUTABLE_MEM(MIR_NAME('')),
      MIR_IMMUTABLE_MEM(MIR_TEMP(''))
    )
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_IMMUTABLE_MEM(MIR_NAME(''))));
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_IMMUTABLE_MEM(MIR_TEMP('')),
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP(''))
    )
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_IMMUTABLE_MEM(MIR_TEMP(''))));

  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_ZERO)
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_ZERO));
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')),
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP(''))
    )
  ).toEqual(
    MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')))
  );
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')),
      MIR_OP('-', MIR_TEMP(''), MIR_TEMP(''))
    )
  ).toEqual(
    MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_OP('-', MIR_TEMP(''), MIR_TEMP('')))
  );
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_OP('+', MIR_TEMP('a'), MIR_TEMP('')),
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP(''))
    )
  ).toEqual(
    MIR_OP('+', MIR_OP('+', MIR_TEMP('a'), MIR_TEMP('')), MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')))
  );

  expect(createMidIRFlexibleOrderOperatorNode('-', MIR_ZERO, MIR_ONE)).toEqual(
    MIR_OP('-', MIR_ZERO, MIR_ONE)
  );
});
