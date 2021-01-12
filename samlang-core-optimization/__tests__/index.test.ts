import optimizeIRCompilationUnit from '..';

import {
  MidIRCompilationUnit,
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
  midIRCompilationUnitToString,
} from 'samlang-core-ast/mir-nodes';

const compilationUnit: MidIRCompilationUnit = {
  globalVariables: [],
  functions: [
    {
      functionName: 'fooBar',
      argumentNames: [],
      mainBodyStatements: [
        MIR_MOVE_TEMP('x', MIR_ONE),
        MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_ONE), 'true'),
        MIR_CALL_FUNCTION(MIR_NAME('f'), [MIR_ONE], 'z2'),
        MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
        MIR_JUMP('r'),
        MIR_LABEL('r'),
        MIR_JUMP('end'),
        MIR_LABEL('true'),
        MIR_MOVE_TEMP('y', MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
        MIR_MOVE_TEMP(
          'z1',
          MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE))
        ),
        MIR_MOVE_TEMP(
          'z2',
          MIR_OP(
            '/',
            MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE)),
            MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
          )
        ),
        MIR_LABEL('end'),
        MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
        MIR_RETURN(MIR_TEMP('a')),
      ],
    },
  ],
};

it('optimizeIRCompilationUnit all enabled test', () => {
  expect(midIRCompilationUnitToString(optimizeIRCompilationUnit(compilationUnit))).toBe(`
function fooBar {

  x = 1;
  if ((x < 1)) goto true;
  z2 = f(1);
  MEM[z2] = (1 + x);
  goto end;
  true:
  y = (1 + x);
  z1 = (y * MEM[1]);
  z2 = (z1 / y);
  end:
  a = (y != z2);
  return a;
}
`);
});

it('optimizeIRCompilationUnit all disabled test', () => {
  expect(midIRCompilationUnitToString(optimizeIRCompilationUnit(compilationUnit, {}))).toBe(`
function fooBar {

  x = 1;
  if ((x < 1)) goto true;
  z2 = f(1);
  MEM[z2] = (1 + x);
  goto end;
  true:
  y = (1 + x);
  z2 = (((1 + x) * MEM[1]) / (1 + x));
  end:
  a = (y != z2);
  return a;
}
`);
});
