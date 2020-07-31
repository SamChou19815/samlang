import {
  MidIRStatement,
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
} from '../../ast/mir';
// eslint-disable-next-line camelcase
import { computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING } from '../common-subexpression-elimination-optimization';

const statements: readonly MidIRStatement[] = [
  /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
  /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_ONE), 'true'),
  /* 02 */ MIR_CALL_FUNCTION('f', [MIR_ONE], 'z2'),
  /* 03 */ MIR_MOVE_IMMUTABLE_MEM(
    MIR_IMMUTABLE_MEM(MIR_TEMP('z2')),
    MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
  ),
  /* 04 */ MIR_JUMP('r'),
  /* 05 */ MIR_LABEL('r'),
  /* 06 */ MIR_JUMP('end'),
  /* 07 */ MIR_LABEL('true'),
  /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
  /* 09 */ MIR_MOVE_TEMP(
    MIR_TEMP('z1'),
    MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE))
  ),
  /* 10 */ MIR_MOVE_TEMP(
    MIR_TEMP('z2'),
    MIR_OP(
      '/',
      MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE)),
      MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
    )
  ),
  /* 11 */ MIR_LABEL('end'),
  /* 12 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
  /* 13 */ MIR_RETURN(MIR_TEMP('a')),
];

it('computeGlobalExpressionUsageAndAppearMap test 1', () => {
  expect(
    Object.fromEntries(
      Array.from(
        computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING(statements).entries()
      ).map(([expression, { appears, usage }]) => [
        expression,
        { appears: Array.from(appears), usage: Array.from(usage) },
      ])
    )
  ).toEqual({
    '(((1 + x) * MEM[1]) / (1 + x))': {
      appears: [10],
      usage: [10],
    },
    '((1 + x) * MEM[1])': {
      appears: [9],
      usage: [9, 10],
    },
    '(1 + x)': {
      appears: [3, 8],
      usage: [],
    },
    '(x < 1)': {
      appears: [1],
      usage: [1],
    },
    '(y != z2)': {
      appears: [12],
      usage: [12],
    },
    'MEM[1]': {
      appears: [9],
      usage: [9, 10],
    },
  });
});

it('computeGlobalExpressionUsageAndAppearMap test 2', () => {
  expect(computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING([MIR_RETURN()]).size).toBe(0);
});
