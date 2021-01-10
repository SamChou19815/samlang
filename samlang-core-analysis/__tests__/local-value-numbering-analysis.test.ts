import analyzeLocalValueNumberingAssignment, {
  LocalNumberingInformation,
} from '../local-value-numbering-analysis';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_EIGHT,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';
import { assertNotNull } from 'samlang-core-utils';

it('analyzeLocalValueNumberingAssignment test 1', () => {
  const localValueNumberingResults = analyzeLocalValueNumberingAssignment([
    /* 00 */ MIR_MOVE_TEMP('x', MIR_ONE),
    /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_ONE), 'true'),
    /* 02 */ MIR_CALL_FUNCTION(MIR_ONE, [MIR_ONE], 'z2'),
    /* 03 */ MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), MIR_ONE),
    /* 04 */ MIR_JUMP('r'),
    /* 05 */ MIR_LABEL('r'),
    /* 06 */ MIR_JUMP('end'),
    /* 07 */ MIR_LABEL('true'),
    /* 08 */ MIR_MOVE_TEMP('y', MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
    /* 09 */ MIR_MOVE_TEMP(
      'z1',
      MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE))
    ),
    /* 10 */ MIR_MOVE_TEMP('z2', MIR_OP('/', MIR_ONE, MIR_ZERO)),
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
      { '((1 + x) * MEM[1])': 4, '(1 + x)': 2, '(x < 1)': 1, 'MEM[1]': 3, x: 0, y: 2, z1: 4 },
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
      MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
    )
  ).toEqual(MIR_TEMP('y'));
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE))
    )
  ).toEqual(MIR_TEMP('z1'));
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_EIGHT))
    )
  ).toBe(null);
  expect(
    localValueNumberingResults10.getTemporaryReplacementForExpression(
      MIR_OP('<', MIR_TEMP('x'), MIR_ONE)
    )
  ).toBe(null);
});

it('analyzeLocalValueNumberingAssignment test 2', () => {
  expect(analyzeLocalValueNumberingAssignment([MIR_RETURN(MIR_ONE)])).toEqual([
    new LocalNumberingInformation({}, {}),
  ]);
});

it('analyzeLocalValueNumberingAssignment test 3', () => {
  expect(
    analyzeLocalValueNumberingAssignment([MIR_CALL_FUNCTION(MIR_ONE, []), MIR_RETURN(MIR_ONE)])
  ).toEqual([new LocalNumberingInformation({}, {}), new LocalNumberingInformation({}, {})]);
});
