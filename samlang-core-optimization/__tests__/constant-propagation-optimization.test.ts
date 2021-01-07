import optimizeIRWithConstantPropagation from '../constant-propagation-optimization';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  midIRStatementToString,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

it('optimizeIRWithConstantPropagation test 1', () => {
  expect(
    optimizeIRWithConstantPropagation([
      MIR_MOVE_TEMP('x', HIR_ONE),
      MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), HIR_INT(2)), 'true'),
      MIR_CALL_FUNCTION(MIR_NAME('f'), [], 'y'),
      MIR_MOVE_TEMP('z1', MIR_OP('+', HIR_ONE, HIR_ZERO)),
      MIR_MOVE_TEMP('z2', MIR_OP('!=', HIR_ONE, HIR_ZERO)),
      MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), MIR_OP('!=', HIR_ONE, HIR_ZERO)),
      MIR_JUMP('end'),
      MIR_LABEL('true'),
      MIR_MOVE_TEMP('y', MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
      MIR_MOVE_TEMP('z1', MIR_OP('*', HIR_ONE, HIR_ONE)),
      MIR_MOVE_TEMP('z2', MIR_OP('/', HIR_ONE, MIR_IMMUTABLE_MEM(HIR_ZERO))),
      MIR_CALL_FUNCTION(MIR_IMMUTABLE_MEM(MIR_TEMP('z2')), [MIR_OP('!=', HIR_ONE, HIR_ZERO)]),
      MIR_LABEL('end'),
      MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_NAME('y'))),
      MIR_RETURN(MIR_TEMP('x')),
    ])
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`x = 1;
goto true;
y = f();
z1 = 1;
z2 = 1;
MEM[1] = 1;
goto end;
true:
y = 2;
z1 = 1;
z2 = (1 / 0[0]);
z2[0](1);
end:
a = (y != y);
return 1;`);
});

it('optimizeIRWithConstantPropagation test 2', () => {
  expect(
    optimizeIRWithConstantPropagation([
      MIR_MOVE_TEMP('x', HIR_ONE),
      MIR_CJUMP_FALLTHROUGH(MIR_OP('<', HIR_INT(2), MIR_TEMP('x')), 'true'),
      MIR_CALL_FUNCTION(MIR_NAME('f'), [], 'y'),
      MIR_MOVE_TEMP('z1', MIR_OP('+', HIR_ONE, HIR_ZERO)),
      MIR_MOVE_TEMP('z2', MIR_OP('!=', HIR_ONE, HIR_ZERO)),
      MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), MIR_OP('!=', HIR_ONE, HIR_ZERO)),
      MIR_JUMP('end'),
      MIR_LABEL('true'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('z'), 'end'),
      MIR_LABEL('end'),
      MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_NAME('y'))),
      MIR_RETURN(MIR_TEMP('x')),
    ])
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`x = 1;
y = f();
z1 = 1;
z2 = 1;
MEM[1] = 1;
goto end;
true:
if (z) goto end;
end:
a = (y != y);
return 1;`);
});
