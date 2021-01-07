import analyzeLocalValueNumberingAssignment, {
  LocalNumberingInformation,
} from '../local-value-numbering-analysis';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
} from 'samlang-core-ast/hir-expressions';
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
import { assertNotNull } from 'samlang-core-utils';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

it('analyzeLocalValueNumberingAssignment test 1', () => {
  const localValueNumberingResults = analyzeLocalValueNumberingAssignment([
    /* 00 */ MIR_MOVE_TEMP('x', HIR_ONE),
    /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), HIR_ONE), 'true'),
    /* 02 */ MIR_CALL_FUNCTION(HIR_ONE, [HIR_ONE], 'z2'),
    /* 03 */ MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), HIR_ONE),
    /* 04 */ MIR_JUMP('r'),
    /* 05 */ MIR_LABEL('r'),
    /* 06 */ MIR_JUMP('end'),
    /* 07 */ MIR_LABEL('true'),
    /* 08 */ MIR_MOVE_TEMP('y', MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
    /* 09 */ MIR_MOVE_TEMP(
      'z1',
      MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_ONE))
    ),
    /* 10 */ MIR_MOVE_TEMP('z2', MIR_OP('/', HIR_ONE, HIR_ZERO)),
    /* 11 */ MIR_LABEL('end'),
    /* 12 */ MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
    /* 13 */ MIR_RETURN(MIR_TEMP('a')),
  ]);
  expect(localValueNumberingResults).toEqual([
    /* 00 */ new LocalNumberingInformation({}, {}),
    /* 01 */ new LocalNumberingInformation({ x: 0 }, { 0: 'x' }),
    /* 02 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0 }, { 0: 'x' }),
    /* 03 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0, z2: 6 }, { 0: 'x', 6: 'z2' }),
    /* 04 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0, z2: 6 }, { 0: 'x', 6: 'z2' }),
    /* 05 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0, z2: 6 }, { 0: 'x', 6: 'z2' }),
    /* 06 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0, z2: 6 }, { 0: 'x', 6: 'z2' }),
    /* 07 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0 }, { 0: 'x' }),
    /* 08 */ new LocalNumberingInformation({ '(x < 1)': 1, x: 0 }, { 0: 'x' }),
    /* 09 */ new LocalNumberingInformation(
      { '(1 + x)': 2, '(x < 1)': 1, x: 0, y: 2 },
      { 0: 'x', 2: 'y' }
    ),
    /* 10 */ new LocalNumberingInformation(
      { '((1 + x) * 1[0])': 4, '(1 + x)': 2, '(x < 1)': 1, '1[0]': 3, x: 0, y: 2, z1: 4 },
      { 0: 'x', 2: 'y', 4: 'z1' }
    ),
    /* 11 */ new LocalNumberingInformation({}, {}),
    /* 12 */ new LocalNumberingInformation({}, {}),
    /* 13 */ new LocalNumberingInformation(
      {
        '(y != z2)': 9,
        a: 9,
        y: 7,
        z2: 8,
      },
      { 9: 'a' }
    ),
  ]);

  const localValueNumberingResults10 = localValueNumberingResults[10];
  assertNotNull(localValueNumberingResults10);
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('+', HIR_ONE, MIR_TEMP('x'))
    )
  ).toEqual(MIR_TEMP('y'));
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_ONE))
    )
  ).toEqual(MIR_TEMP('z1'));
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_INT(8)))
    )
  ).toBe(null);
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('<', MIR_TEMP('x'), HIR_ONE)
    )
  ).toBe(null);
});

it('analyzeLocalValueNumberingAssignment test 2', () => {
  expect(analyzeLocalValueNumberingAssignment([MIR_RETURN(HIR_ONE)])).toEqual([
    new LocalNumberingInformation({}, {}),
  ]);
});

it('analyzeLocalValueNumberingAssignment test 3', () => {
  expect(
    analyzeLocalValueNumberingAssignment([MIR_CALL_FUNCTION(HIR_ONE, []), MIR_RETURN(HIR_ONE)])
  ).toEqual([new LocalNumberingInformation({}, {}), new LocalNumberingInformation({}, {})]);
});
