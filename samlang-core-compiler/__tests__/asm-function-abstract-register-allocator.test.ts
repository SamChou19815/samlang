import AssemblyFunctionAbstractRegisterAllocator from '../asm-function-abstract-register-allocator';

it('AssemblyFunctionAbstractRegisterAllocator test', () => {
  const allocator = new AssemblyFunctionAbstractRegisterAllocator();
  expect(allocator.nextReg().id).toBe('_ABSTRACT_REG_0');
  expect(allocator.nextReg().id).toBe('_ABSTRACT_REG_1');
  expect(allocator.nextReg().id).toBe('_ABSTRACT_REG_2');
});
