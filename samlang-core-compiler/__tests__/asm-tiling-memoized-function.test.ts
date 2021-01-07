import {
  getMemoizedAssemblyExpressionTilingFunction,
  getMemoizedAssemblyStatementTilingFunction,
} from '../asm-tiling-memoized-function';

import { HIR_INT } from 'samlang-core-ast/hir-expressions';
import { MIR_JUMP } from 'samlang-core-ast/mir-nodes';

it('function returned by getMemoizedAssemblyExpressionTilingFunction is correctly memoized.', () => {
  let called = 0;
  const f = getMemoizedAssemblyExpressionTilingFunction((expression) => {
    called += 1;
    return expression.__type__.length;
  });
  const C0 = HIR_INT(0);
  expect(f(C0)).toBe(26);
  expect(f(C0)).toBe(26);
  expect(f(HIR_INT(1))).toBe(26);
  expect(f(HIR_INT(1))).toBe(26);
  expect(f(HIR_INT(2))).toBe(26);
  expect(f(HIR_INT(3))).toBe(26);
  expect(called).toBe(5);
});

it('getMemoizedAssemblyStatementTilingFunction basic test', () => {
  expect(getMemoizedAssemblyStatementTilingFunction((s) => s.__type__.length)(MIR_JUMP(''))).toBe(
    18
  );
});
