import analyzeAvailableExpressionsComingOutAtEachStatement from '../available-expressions-analysis';

import {
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
import { checkNotNull } from 'samlang-core-utils';

it('analyzeLocalValueNumberingAssignment test 1', () => {
  const localValueNumberingResults = analyzeAvailableExpressionsComingOutAtEachStatement([
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
  ]).map((it) =>
    Object.fromEntries(it.entries().map((entry) => [entry[0].uniqueHash(), entry[1]]))
  );
  expect(localValueNumberingResults).toEqual([
    /* 00 */ {},
    /* 01 */ { '(x < 1)': [1] },
    /* 02 */ { '(x < 1)': [1] },
    /* 03 */ { '(1 + x)': [3], '(x < 1)': [1] },
    /* 04 */ { '(1 + x)': [3], '(x < 1)': [1] },
    /* 05 */ { '(1 + x)': [3], '(x < 1)': [1] },
    /* 06 */ { '(1 + x)': [3], '(x < 1)': [1] },
    /* 07 */ { '(x < 1)': [1] },
    /* 08 */ { '(1 + x)': [8], '(x < 1)': [1] },
    /* 09 */ { '((1 + x) * MEM[1])': [9], '(1 + x)': [8], '(x < 1)': [1], 'MEM[1]': [9] },
    /* 10 */ {
      '(((1 + x) * MEM[1]) / (1 + x))': [10],
      '((1 + x) * MEM[1])': [9],
      '(1 + x)': [8],
      '(x < 1)': [1],
      'MEM[1]': [9],
    },
    /* 11 */ { '(1 + x)': [8, 3], '(x < 1)': [1] },
    /* 12 */ { '(1 + x)': [8, 3], '(x < 1)': [1], '(y != z2)': [12] },
    /* 13 */ { '(1 + x)': [8, 3], '(x < 1)': [1], '(y != z2)': [12] },
  ]);
});

it('analyzeLocalValueNumberingAssignment test 2', () => {
  expect(
    checkNotNull(analyzeAvailableExpressionsComingOutAtEachStatement([MIR_RETURN()])[0]).size
  ).toBe(0);
});
