import analyzePropagatedConstants from '../constant-propagation-analysis';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_CONST,
  MIR_TEMP,
  MIR_NAME,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
} from 'samlang-core-ast/mir-nodes';
import { Long } from 'samlang-core-utils';

it('analyzePropagatedConstants test 1', () => {
  expect(
    analyzePropagatedConstants([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_CONST(2)), 'true'),
      /* 02 */ MIR_CALL_FUNCTION('f', [], 'y'),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('+', MIR_ONE, MIR_ZERO)),
      /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('!=', MIR_ONE, MIR_ZERO)),
      /* 05 */ MIR_JUMP('end'),
      /* 06 */ MIR_LABEL('true'),
      /* 07 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('*', MIR_ONE, MIR_ONE)),
      /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('/', MIR_ONE, MIR_ZERO)),
      /* 10 */ MIR_LABEL('end'),
      /* 11 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('y'))),
    ]).map((it) => Object.fromEntries(it.entries()))
  ).toEqual([
    /* 00 */ {},
    /* 01 */ { x: Long.fromInt(1) },
    /* 02 */ { x: Long.fromInt(1) },
    /* 03 */ { x: Long.fromInt(1) },
    /* 04 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
    /* 05 */ { x: Long.fromInt(1), z1: Long.fromInt(1), z2: Long.fromInt(1) },
    /* 06 */ { x: Long.fromInt(1) },
    /* 07 */ { x: Long.fromInt(1) },
    /* 08 */ { x: Long.fromInt(1), y: Long.fromInt(2) },
    /* 09 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1) },
    /* 10 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
    /* 11 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
  ]);
});

it('analyzePropagatedConstants test 2', () => {
  expect(
    analyzePropagatedConstants([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_OP('^', MIR_ZERO, MIR_ONE)),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_CONST(2)), 'true'),
      /* 02 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('-', MIR_CONST(3), MIR_TEMP('x'))),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('<', MIR_ZERO, MIR_ONE)),
      /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('%', MIR_ONE, MIR_ZERO)),
      /* 05 */ MIR_JUMP('end'),
      /* 06 */ MIR_LABEL('true'),
      /* 07 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_NAME('foo')),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('/', MIR_ONE, MIR_ONE)),
      /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('%', MIR_ONE, MIR_CONST(2))),
      /* 10 */ MIR_LABEL('end'),
      /* 11 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('==', MIR_TEMP('y'), MIR_TEMP('x'))),
    ]).map((it) => Object.fromEntries(it.entries()))
  ).toEqual([
    /* 00 */ {},
    /* 01 */ { x: Long.fromInt(1) },
    /* 02 */ { x: Long.fromInt(1) },
    /* 03 */ { x: Long.fromInt(1), y: Long.fromInt(2) },
    /* 04 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1) },
    /* 05 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1) },
    /* 06 */ { x: Long.fromInt(1) },
    /* 07 */ { x: Long.fromInt(1) },
    /* 08 */ { x: Long.fromInt(1) },
    /* 09 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
    /* 10 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
    /* 11 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
  ]);
});

it('analyzePropagatedConstants test 3', () => {
  expect(
    analyzePropagatedConstants([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_OP('<=', MIR_ZERO, MIR_ONE)),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_CONST(2)), 'true'),
      /* 02 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('-', MIR_CONST(3), MIR_TEMP('x'))),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('>', MIR_ONE, MIR_ZERO)),
      /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('%', MIR_ONE, MIR_ONE)),
      /* 05 */ MIR_JUMP('end'),
      /* 06 */ MIR_LABEL('true'),
      /* 07 */ MIR_CALL_FUNCTION('f', []),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('>=', MIR_ONE, MIR_ONE)),
      /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('==', MIR_ONE, MIR_ONE)),
      /* 10 */ MIR_LABEL('end'),
      /* 11 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('*', MIR_ONE, MIR_NAME('y'))),
    ]).map((it) => Object.fromEntries(it.entries()))
  ).toEqual([
    /* 00 */ {},
    /* 01 */ { x: Long.fromInt(1) },
    /* 02 */ { x: Long.fromInt(1) },
    /* 03 */ { x: Long.fromInt(1), y: Long.fromInt(2) },
    /* 04 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1) },
    /* 05 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1), z2: Long.fromInt(0) },
    /* 06 */ { x: Long.fromInt(1) },
    /* 07 */ { x: Long.fromInt(1) },
    /* 08 */ { x: Long.fromInt(1) },
    /* 09 */ { x: Long.fromInt(1), z1: Long.fromInt(1) },
    /* 10 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1) },
    /* 11 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(1) },
  ]);
});

it('analyzePropagatedConstants test 4', () => {
  expect(
    analyzePropagatedConstants([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_OP('<=', MIR_ZERO, MIR_ONE)),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_CONST(2), MIR_TEMP('x')), 'true'),
      /* 02 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('-', MIR_CONST(3), MIR_TEMP('x'))),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('>', MIR_ONE, MIR_ONE)),
      /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('<', MIR_ONE, MIR_ZERO)),
      /* 05 */ MIR_JUMP('end'),
      /* 06 */ MIR_LABEL('true'),
      /* 07 */ MIR_CALL_FUNCTION('f', []),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('>=', MIR_ZERO, MIR_ONE)),
      /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('<=', MIR_ONE, MIR_ZERO)),
      /* 10 */ MIR_LABEL('end'),
      /* 11 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('*', MIR_ONE, MIR_TEMP('zucc'))),
    ]).map((it) => Object.fromEntries(it.entries()))
  ).toEqual([
    /* 00 */ {},
    /* 01 */ { x: Long.fromInt(1) },
    /* 02 */ { x: Long.fromInt(1) },
    /* 03 */ { x: Long.fromInt(1), y: Long.fromInt(2) },
    /* 04 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0) },
    /* 05 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0), z2: Long.fromInt(0) },
    /* 06 */ { x: Long.fromInt(1) },
    /* 07 */ { x: Long.fromInt(1) },
    /* 08 */ { x: Long.fromInt(1) },
    /* 09 */ { x: Long.fromInt(1), z1: Long.fromInt(0) },
    /* 10 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0), z2: Long.fromInt(0) },
    /* 11 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0), z2: Long.fromInt(0) },
  ]);
});

it('analyzePropagatedConstants test 5', () => {
  expect(
    analyzePropagatedConstants([
      /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_OP('<=', MIR_ZERO, MIR_ONE)),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_CONST(2), MIR_TEMP('x')), 'true'),
      /* 02 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('-', MIR_CONST(3), MIR_TEMP('x'))),
      /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('==', MIR_ONE, MIR_ZERO)),
      /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('<', MIR_ONE, MIR_ZERO)),
      /* 05 */ MIR_JUMP('end'),
      /* 06 */ MIR_LABEL('true'),
      /* 07 */ MIR_CALL_FUNCTION('f', []),
      /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('>=', MIR_ZERO, MIR_ONE)),
      /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('!=', MIR_ONE, MIR_ONE)),
      /* 10 */ MIR_LABEL('end'),
      /* 11 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('*', MIR_ONE, MIR_TEMP('zucc'))),
    ]).map((it) => Object.fromEntries(it.entries()))
  ).toEqual([
    /* 00 */ {},
    /* 01 */ { x: Long.fromInt(1) },
    /* 02 */ { x: Long.fromInt(1) },
    /* 03 */ { x: Long.fromInt(1), y: Long.fromInt(2) },
    /* 04 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0) },
    /* 05 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0), z2: Long.fromInt(0) },
    /* 06 */ { x: Long.fromInt(1) },
    /* 07 */ { x: Long.fromInt(1) },
    /* 08 */ { x: Long.fromInt(1) },
    /* 09 */ { x: Long.fromInt(1), z1: Long.fromInt(0) },
    /* 10 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0), z2: Long.fromInt(0) },
    /* 11 */ { x: Long.fromInt(1), y: Long.fromInt(2), z1: Long.fromInt(0), z2: Long.fromInt(0) },
  ]);
});
