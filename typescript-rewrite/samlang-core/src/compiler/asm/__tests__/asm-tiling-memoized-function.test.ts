import { MIR_CONST, MIR_JUMP } from '../../../ast/mir';
import {
  getMemoizedAssemblyExpressionTilingFunction,
  getMemoizedAssemblyStatementTilingFunction,
} from '../asm-tiling-memoized-function';

it('function returned by getMemoizedAssemblyExpressionTilingFunction is correctly memoized.', () => {
  let called = 0;
  const f = getMemoizedAssemblyExpressionTilingFunction((expression) => {
    called += 1;
    return expression.__type__.length;
  });
  expect(f(MIR_CONST(BigInt(0)))).toBe(23);
  expect(f(MIR_CONST(BigInt(0)))).toBe(23);
  expect(f(MIR_CONST(BigInt(1)))).toBe(23);
  expect(f(MIR_CONST(BigInt(1)))).toBe(23);
  expect(f(MIR_CONST(BigInt(2)))).toBe(23);
  expect(f(MIR_CONST(BigInt(3)))).toBe(23);
  expect(called).toBe(4);
});

it('getMemoizedAssemblyStatementTilingFunction basic test', () => {
  expect(getMemoizedAssemblyStatementTilingFunction((s) => s.__type__.length)(MIR_JUMP(''))).toBe(
    18
  );
});
