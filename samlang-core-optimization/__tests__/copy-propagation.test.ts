import optimizeIRWithCopyPropagation from '../copy-propagation-optimization';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_ZERO,
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
  midIRStatementToString,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

it('optimizeIRWithCopyPropagation test 1', () => {
  expect(
    optimizeIRWithCopyPropagation([
      MIR_MOVE_TEMP('a', HIR_ONE),
      MIR_MOVE_TEMP('b', HIR_ZERO),
      MIR_MOVE_TEMP('c', HIR_INT(8)),
      MIR_MOVE_TEMP('x', MIR_TEMP('a')),
      MIR_MOVE_TEMP('y', MIR_TEMP('b')),
      MIR_MOVE_TEMP('z', MIR_TEMP('c')),
      MIR_MOVE_TEMP('x', MIR_TEMP('b')),
      MIR_CALL_FUNCTION(HIR_ONE, [], 'y'),
      MIR_MOVE_TEMP('z', MIR_TEMP('x')),
      MIR_CALL_FUNCTION(HIR_ONE, [MIR_TEMP('z')]),
      MIR_RETURN(MIR_TEMP('z')),
      MIR_RETURN(HIR_ONE),
    ])
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`a = 1;
b = 0;
c = 8;
x = a;
y = b;
z = c;
x = b;
y = 1();
z = b;
1(b);
return b;
return 1;`);
});

it('optimizeIRWithCopyPropagation test 2', () => {
  expect(
    optimizeIRWithCopyPropagation([
      MIR_MOVE_TEMP('a', HIR_ONE),
      MIR_MOVE_TEMP('b', MIR_OP('+', HIR_ZERO, HIR_ZERO)),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('a'), 'true'),
      MIR_MOVE_TEMP('x', MIR_TEMP('a')),
      MIR_JUMP('end'),
      MIR_LABEL('true'),
      MIR_MOVE_TEMP('x', MIR_TEMP('b')),
      MIR_LABEL('end'),
      MIR_MOVE_TEMP('y', MIR_TEMP('x')),
      MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('y'), MIR_IMMUTABLE_MEM(MIR_TEMP('x'))),
    ])
      .map(midIRStatementToString)
      .join(`\n`)
  ).toBe(`a = 1;
b = (0 + 0);
if (a) goto true;
x = a;
goto end;
true:
x = b;
end:
y = x;
MEM[x] = x[0];`);
});
