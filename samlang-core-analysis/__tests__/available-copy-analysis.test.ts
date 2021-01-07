import analyzeAvailableCopies from '../available-copy-analysis';

import { HIR_ZERO, HIR_ONE, HIR_INT, HIR_VARIABLE } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);

it('analyzeAvailableCopies test 1', () => {
  expect(
    analyzeAvailableCopies([
      /* 00 */ MIR_MOVE_TEMP('a', HIR_ONE),
      /* 01 */ MIR_MOVE_TEMP('b', HIR_ZERO),
      /* 02 */ MIR_MOVE_TEMP('c', HIR_INT(8)),
      /* 03 */ MIR_MOVE_TEMP('x', MIR_TEMP('a')),
      /* 04 */ MIR_MOVE_TEMP('y', MIR_TEMP('b')),
      /* 05 */ MIR_MOVE_TEMP('z', MIR_TEMP('c')),
      /* 06 */ MIR_MOVE_TEMP('x', MIR_TEMP('b')),
      /* 07 */ MIR_CALL_FUNCTION(HIR_ONE, [], 'y'),
      /* 08 */ MIR_MOVE_TEMP('z', MIR_TEMP('x')),
      /* 09 */ MIR_CALL_FUNCTION(HIR_ZERO, []),
      /* 10 */ MIR_RETURN(HIR_ONE),
    ])
  ).toEqual([
    /* 00 */ {},
    /* 01 */ {},
    /* 02 */ {},
    /* 03 */ {},
    /* 04 */ { x: 'a' },
    /* 05 */ { x: 'a', y: 'b' },
    /* 06 */ { x: 'a', y: 'b', z: 'c' },
    /* 07 */ { y: 'b', z: 'c', x: 'b' },
    /* 08 */ { z: 'c', x: 'b' },
    /* 09 */ { x: 'b', z: 'b' },
    /* 10 */ { x: 'b', z: 'b' },
  ]);
});

it('analyzeAvailableCopies test 2', () => {
  expect(
    analyzeAvailableCopies([
      /* 00 */ MIR_MOVE_TEMP('a', HIR_ONE),
      /* 01 */ MIR_MOVE_TEMP('b', HIR_ZERO),
      /* 02 */ MIR_CJUMP_FALLTHROUGH(MIR_TEMP('a'), 'true'),
      /* 03 */ MIR_MOVE_TEMP('x', MIR_TEMP('a')),
      /* 04 */ MIR_JUMP('end'),
      /* 05 */ MIR_LABEL('true'),
      /* 06 */ MIR_MOVE_TEMP('x', MIR_TEMP('b')),
      /* 07 */ MIR_LABEL('end'),
      /* 08 */ MIR_MOVE_TEMP('y', MIR_TEMP('x')),
      /* 09 */ MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('y'), MIR_TEMP('x')),
    ])
  ).toEqual([
    /* 00 */ {},
    /* 01 */ {},
    /* 02 */ {},
    /* 03 */ {},
    /* 04 */ { x: 'a' },
    /* 05 */ {},
    /* 06 */ {},
    /* 07 */ {},
    /* 08 */ {},
    /* 09 */ { y: 'x' },
  ]);
});

it('analyzeAvailableCopies test 3', () => {
  // Previously, we don't have any special casing for loops that start at the first line.
  // This is a tricky case since then it will trick the first statement to believe that it's only
  // parent is a jump to the loop start, ignoring the fact that there is an implicit parent.
  expect(
    analyzeAvailableCopies([
      /* 00 */ MIR_LABEL('loop_start'),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(HIR_ZERO, 'loop_end'),
      /* 02 */ MIR_MOVE_TEMP('t0', MIR_TEMP('i')),
      /* 03 */ MIR_MOVE_TEMP('t1', MIR_TEMP('j')),
      /* 04 */ MIR_MOVE_TEMP('i', MIR_TEMP('t1')),
      /* 05 */ MIR_JUMP('loop_start'),
      /* 06 */ MIR_LABEL('loop_end'),
    ])
  ).toEqual([
    /* 00 */ {},
    /* 01 */ {},
    /* 02 */ {},
    /* 03 */ { t0: 'i' },
    /* 04 */ { t0: 'i', t1: 'j' },
    /* 05 */ { i: 'j', t1: 'j' },
    /* 06 */ {},
  ]);
});
