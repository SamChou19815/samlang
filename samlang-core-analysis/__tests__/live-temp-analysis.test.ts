import analyzeLiveTemporariesAtTheEndOfEachStatement from '../live-temp-analysis';

import {
  MidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_TEMP,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  MIR_IMMUTABLE_MEM,
} from 'samlang-core-ast/mir-nodes';

const analyze = (statements: readonly MidIRStatement[]): readonly (readonly string[])[] =>
  analyzeLiveTemporariesAtTheEndOfEachStatement(statements).map((it) => Array.from(it));

it('analyzeLiveTemporariesAtTheEndOfEachStatement test', () => {
  expect(
    analyze([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_ONE), 'true'),
      /* 02 */ MIR_CALL_FUNCTION('f', [MIR_ONE], 'z2'),
      /* 03 */ MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('z2')), MIR_ONE),
      /* 04 */ MIR_JUMP('r'),
      /* 05 */ MIR_LABEL('r'),
      /* 06 */ MIR_RETURN(),
      /* 07 */ MIR_LABEL('true'),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
      /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('*', MIR_ONE, MIR_IMMUTABLE_MEM(MIR_ONE))),
      /* 10 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('/', MIR_ONE, MIR_ZERO)),
      /* 11 */ MIR_LABEL('end'),
      /* 12 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
      /* 13 */ MIR_RETURN(MIR_TEMP('a')),
      /* 14 */ MIR_RETURN(),
    ])
  ).toEqual([
    /* 00 */ ['x'],
    /* 01 */ ['x'],
    /* 02 */ ['z2'],
    /* 03 */ [],
    /* 04 */ [],
    /* 05 */ [],
    /* 06 */ [],
    /* 07 */ ['x'],
    /* 08 */ ['y'],
    /* 09 */ ['y'],
    /* 10 */ ['y', 'z2'],
    /* 11 */ ['y', 'z2'],
    /* 12 */ ['a'],
    /* 13 */ [],
    /* 14 */ [],
  ]);
});
