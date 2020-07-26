import {
  MidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_EIGHT,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
} from '../../ast/mir';
import analyzeAvailableCopies, { AvailableCopy } from '../available-copy-analysis';

const analyze = (statements: readonly MidIRStatement[]): readonly (readonly AvailableCopy[])[] =>
  analyzeAvailableCopies(statements).map((it) => it.toArray());

it('analyzeAvailableCopies test 1', () => {
  expect(
    analyze([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_ONE),
      /* 01 */ MIR_MOVE_TEMP(MIR_TEMP('b'), MIR_ZERO),
      /* 02 */ MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_EIGHT),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_TEMP('a')),
      /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_TEMP('b')),
      /* 05 */ MIR_MOVE_TEMP(MIR_TEMP('z'), MIR_TEMP('c')),
      /* 06 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_TEMP('b')),
      /* 07 */ MIR_CALL_FUNCTION('fff', [], 'y'),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('z'), MIR_TEMP('a')),
      /* 09 */ MIR_CALL_FUNCTION('fff', []),
      /* 10 */ MIR_RETURN(),
    ])
  ).toEqual([
    /* 00 */ [],
    /* 01 */ [],
    /* 02 */ [],
    /* 03 */ [],
    /* 04 */ [new AvailableCopy('x', 'a')],
    /* 05 */ [new AvailableCopy('x', 'a'), new AvailableCopy('y', 'b')],
    /* 06 */ [
      new AvailableCopy('x', 'a'),
      new AvailableCopy('y', 'b'),
      new AvailableCopy('z', 'c'),
    ],
    /* 07 */ [
      new AvailableCopy('y', 'b'),
      new AvailableCopy('z', 'c'),
      new AvailableCopy('x', 'b'),
    ],
    /* 08 */ [new AvailableCopy('z', 'c'), new AvailableCopy('x', 'b')],
    /* 09 */ [new AvailableCopy('x', 'b'), new AvailableCopy('z', 'a')],
    /* 10 */ [new AvailableCopy('x', 'b'), new AvailableCopy('z', 'a')],
  ]);
});

it('analyzeAvailableCopies test 2', () => {
  expect(
    analyze([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_ONE),
      /* 01 */ MIR_MOVE_TEMP(MIR_TEMP('b'), MIR_ZERO),
      /* 02 */ MIR_CJUMP_FALLTHROUGH(MIR_TEMP('a'), 'true'),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_TEMP('a')),
      /* 04 */ MIR_JUMP('end'),
      /* 05 */ MIR_LABEL('true'),
      /* 06 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_TEMP('b')),
      /* 07 */ MIR_LABEL('end'),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_TEMP('x')),
      /* 09 */ MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('y')), MIR_TEMP('x')),
    ])
  ).toEqual([
    /* 00 */ [],
    /* 01 */ [],
    /* 02 */ [],
    /* 03 */ [],
    /* 04 */ [new AvailableCopy('x', 'a')],
    /* 05 */ [],
    /* 06 */ [],
    /* 07 */ [],
    /* 08 */ [],
    /* 09 */ [new AvailableCopy('y', 'x')],
  ]);
});
