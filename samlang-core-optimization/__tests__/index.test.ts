import optimizeIRCompilationUnit from '..';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
  HIR_NAME,
  HIR_ONE,
  HIR_VARIABLE,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRCompilationUnit,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  midIRCompilationUnitToString,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const compilationUnit: MidIRCompilationUnit = {
  globalVariables: [],
  functions: [
    {
      functionName: 'fooBar',
      argumentNames: [],
      mainBodyStatements: [
        MIR_MOVE_TEMP('x', HIR_ONE),
        MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), HIR_ONE), 'true'),
        MIR_CALL_FUNCTION(HIR_NAME('f', HIR_INT_TYPE), [HIR_ONE], 'z2'),
        MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
        MIR_JUMP('r'),
        MIR_LABEL('r'),
        MIR_JUMP('end'),
        MIR_LABEL('true'),
        MIR_MOVE_TEMP('y', MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
        MIR_MOVE_TEMP(
          'z1',
          MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_ONE))
        ),
        MIR_MOVE_TEMP(
          'z2',
          MIR_OP(
            '/',
            MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_ONE)),
            MIR_OP('+', HIR_ONE, MIR_TEMP('x'))
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

  z2 = f(1);
  MEM[z2] = 2;
  a = (2 != z2);
  return a;
}
`);
});

it('optimizeIRCompilationUnit all disabled test', () => {
  expect(midIRCompilationUnitToString(optimizeIRCompilationUnit(compilationUnit, {}))).toBe(`
function fooBar {

  z2 = f(1);
  MEM[z2] = 2;
  a = (2 != z2);
  return a;
}
`);
});
