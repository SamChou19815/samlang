import { MIR_CONST, MIR_NAME, MIR_TEMP, MIR_IMMUTABLE_MEM, MIR_OP } from '../../ast/mir-nodes';
import createMidIRFlexibleOrderOperatorNode from '../mir-flexible-op';

it('createMidIRFlexibleOrderOperatorNode test', () => {
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_CONST(BigInt(0)), MIR_CONST(BigInt(1)))
  ).toEqual(MIR_OP('+', MIR_CONST(BigInt(1)), MIR_CONST(BigInt(0))));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_CONST(BigInt(0)), MIR_CONST(BigInt(0)))
  ).toEqual(MIR_OP('+', MIR_CONST(BigInt(0)), MIR_CONST(BigInt(0))));
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_CONST(BigInt(1)), MIR_CONST(BigInt(0)))
  ).toEqual(MIR_OP('+', MIR_CONST(BigInt(1)), MIR_CONST(BigInt(0))));
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_CONST(BigInt(0)), MIR_NAME(''))).toEqual(
    MIR_OP('+', MIR_NAME(''), MIR_CONST(BigInt(0)))
  );
  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_CONST(BigInt(0)), MIR_TEMP(''))).toEqual(
    MIR_OP('+', MIR_TEMP(''), MIR_CONST(BigInt(0)))
  );
  expect(
    createMidIRFlexibleOrderOperatorNode('+', MIR_CONST(BigInt(0)), MIR_IMMUTABLE_MEM(MIR_TEMP('')))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_CONST(BigInt(0))));
  expect(
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_CONST(BigInt(0)),
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP(''))
    )
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_CONST(BigInt(0))));

  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_NAME(''), MIR_CONST(BigInt(0)))).toEqual(
    MIR_OP('+', MIR_NAME(''), MIR_CONST(BigInt(0)))
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

  expect(createMidIRFlexibleOrderOperatorNode('+', MIR_TEMP(''), MIR_CONST(BigInt(0)))).toEqual(
    MIR_OP('+', MIR_TEMP(''), MIR_CONST(BigInt(0)))
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
    createMidIRFlexibleOrderOperatorNode('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_CONST(BigInt(0)))
  ).toEqual(MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_CONST(BigInt(0))));
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
    createMidIRFlexibleOrderOperatorNode(
      '+',
      MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')),
      MIR_CONST(BigInt(0))
    )
  ).toEqual(MIR_OP('+', MIR_OP('+', MIR_TEMP(''), MIR_TEMP('')), MIR_CONST(BigInt(0))));
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

  expect(
    createMidIRFlexibleOrderOperatorNode('-', MIR_CONST(BigInt(0)), MIR_CONST(BigInt(1)))
  ).toEqual(MIR_OP('-', MIR_CONST(BigInt(0)), MIR_CONST(BigInt(1))));
});
