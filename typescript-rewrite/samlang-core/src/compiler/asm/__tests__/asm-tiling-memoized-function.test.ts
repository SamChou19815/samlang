import { MIR_CONST } from '../../../ast/mir';
import getMemoizedAssemblyTilingFunction from '../asm-tiling-memoized-function';

it('function returned by getMemoizedAssemblyTilingFunction is correctly memoized.', () => {
  let called = 0;
  const f = getMemoizedAssemblyTilingFunction((expression) => {
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
