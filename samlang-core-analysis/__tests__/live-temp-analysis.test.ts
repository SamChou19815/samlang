import analyzeLiveTemporariesAtTheEndOfEachStatement from '../live-temp-analysis';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ONE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRStatement,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const analyze = (statements: readonly MidIRStatement[]): readonly (readonly string[])[] =>
  analyzeLiveTemporariesAtTheEndOfEachStatement(statements).map((it) => Array.from(it));

it('analyzeLiveTemporariesAtTheEndOfEachStatement test', () => {
  expect(
    analyze([
      /* 00 */ MIR_MOVE_TEMP('x', HIR_ONE),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), HIR_ONE), 'true'),
      /* 02 */ MIR_CALL_FUNCTION(NAME('f'), [HIR_ONE], 'z2'),
      /* 03 */ MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), HIR_ONE),
      /* 04 */ MIR_JUMP('r'),
      /* 05 */ MIR_LABEL('r'),
      /* 06 */ MIR_RETURN(HIR_ONE),
      /* 07 */ MIR_LABEL('true'),
      /* 08 */ MIR_MOVE_TEMP('y', MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
      /* 09 */ MIR_MOVE_TEMP('z1', MIR_OP('*', HIR_ONE, MIR_IMMUTABLE_MEM(HIR_ONE))),
      /* 10 */ MIR_MOVE_TEMP('z2', MIR_OP('/', HIR_ONE, HIR_ONE)),
      /* 11 */ MIR_LABEL('end'),
      /* 12 */ MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
      /* 13 */ MIR_RETURN(MIR_TEMP('a')),
      /* 14 */ MIR_RETURN(HIR_ONE),
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
