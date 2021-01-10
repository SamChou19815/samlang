import optimizeIRWithLocalValueNumbering from '../local-value-numbering-optimization';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_TEMP,
  MIR_NAME,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  midIRStatementToString,
} from 'samlang-core-ast/mir-nodes';

it('optimizeIRWithLocalValueNumbering test', () => {
  expect(
    optimizeIRWithLocalValueNumbering([
      /* 00 */ MIR_MOVE_TEMP('x', MIR_ONE),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_ONE), 'true'),
      /* 02 */ MIR_CALL_FUNCTION(MIR_NAME('f'), [MIR_ONE], 'z2'),
      /* 03 */ MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), MIR_ONE),
      /* 04 */ MIR_JUMP('r'),
      /* 05 */ MIR_LABEL('r'),
      /* 06 */ MIR_RETURN(MIR_ZERO),
      /* 07 */ MIR_LABEL('true'),
      /* 08 */ MIR_MOVE_TEMP('y', MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
      /* 09 */ MIR_MOVE_TEMP(
        'z1',
        MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE))
      ),
      /* 10 */ MIR_MOVE_TEMP(
        'z2',
        MIR_OP(
          '/',
          MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE)),
          MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
        )
      ),
      /* 11 */ MIR_LABEL('end'),
      /* 12 */ MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
      /* 13 */ MIR_RETURN(MIR_TEMP('a')),
    ])
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`x = 1;
if ((x < 1)) goto true;
z2 = f(1);
MEM[z2] = 1;
goto r;
r:
return 0;
true:
y = (1 + x);
z1 = (y * MEM[1]);
z2 = (z1 / y);
end:
a = (y != z2);
return a;`);
});
