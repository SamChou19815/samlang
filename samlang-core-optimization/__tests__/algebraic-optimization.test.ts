import optimizeIRWithAlgebraicSimplification from '../algebraic-optimization';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HIR_ZERO,
  HIR_NAME,
  HIR_INT,
  HIR_VARIABLE,
  HighIRExpression,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_ONE,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRStatement,
  midIRStatementToString,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
  MIR_CALL_FUNCTION,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const optimizeAndDumpToString = (statements: readonly MidIRStatement[]): string =>
  optimizeIRWithAlgebraicSimplification(statements).map(midIRStatementToString).join('\n');
it('optimizeIRWithConstantFolding normal tests', () => {
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP('a', MIR_IMMUTABLE_MEM(MIR_OP('+', HIR_NAME('foo', HIR_INT_TYPE), HIR_INT(3)))),
    ])
  ).toBe('a = (foo + 3)[0];');

  expect(
    optimizeAndDumpToString([MIR_MOVE_IMMUTABLE_MEM(HIR_INT(8), MIR_IMMUTABLE_MEM(HIR_INT(8)))])
  ).toBe('MEM[8] = 8[0];');

  expect(optimizeAndDumpToString([MIR_JUMP('foo')])).toBe('goto foo;');
  expect(
    optimizeAndDumpToString([MIR_CALL_FUNCTION(HIR_NAME('foo', HIR_INT_TYPE), [HIR_INT(8)])])
  ).toBe('foo(8);');
  expect(optimizeAndDumpToString([MIR_RETURN(HIR_ZERO)])).toBe('return 0;');
  expect(optimizeAndDumpToString([MIR_RETURN(HIR_INT(8))])).toBe('return 8;');

  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<', HIR_INT(8), HIR_INT(8)), 'a')])
  ).toBe('if ((8 < 8)) goto a;');

  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('+', HIR_ZERO, HIR_INT(8)))])).toBe(
    'return 8;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('+', HIR_INT(8), HIR_ZERO))])).toBe(
    'return 8;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('^', HIR_ZERO, HIR_INT(8)))])).toBe(
    'return 8;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('^', HIR_INT(8), HIR_ZERO))])).toBe(
    'return 8;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('*', MIR_TEMP('a'), HIR_ONE))])).toBe(
    'return a;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('*', HIR_ONE, MIR_TEMP('a')))])).toBe(
    'return a;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('*', MIR_TEMP('a'), MIR_TEMP('a')))])).toBe(
    'return (a * a);'
  );
});
