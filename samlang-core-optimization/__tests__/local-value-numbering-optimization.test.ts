import optimizeIRWithLocalValueNumbering from '../local-value-numbering-optimization';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
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
  MIR_RETURN,
  midIRStatementToString,
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

it('optimizeIRWithLocalValueNumbering test', () => {
  expect(
    optimizeIRWithLocalValueNumbering([
      /* 00 */ MIR_MOVE_TEMP('x', HIR_ONE),
      /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), HIR_ONE), 'true'),
      /* 02 */ MIR_CALL_FUNCTION(MIR_NAME('f'), [HIR_ONE], 'z2'),
      /* 03 */ MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('z2'), HIR_ONE),
      /* 04 */ MIR_JUMP('r'),
      /* 05 */ MIR_LABEL('r'),
      /* 06 */ MIR_RETURN(HIR_ZERO),
      /* 07 */ MIR_LABEL('true'),
      /* 08 */ MIR_MOVE_TEMP('y', MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
      /* 09 */ MIR_MOVE_TEMP(
        'z1',
        MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_ONE))
      ),
      /* 10 */ MIR_MOVE_TEMP(
        'z2',
        MIR_OP(
          '/',
          MIR_OP('*', MIR_OP('+', HIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(HIR_ONE)),
          MIR_OP('+', HIR_ONE, MIR_TEMP('x'))
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
z1 = (y * 1[0]);
z2 = (z1 / y);
end:
a = (y != z2);
return a;`);
});
