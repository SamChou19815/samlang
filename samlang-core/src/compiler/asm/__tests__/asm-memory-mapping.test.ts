import { ASM_CONST, ASM_MEM_CONST } from '../../../ast/asm/asm-arguments';
import { AssemblyMemoryMapping } from '../asm-memory-mapping';

it('AssemblyMemoryMapping self consistency test', () => {
  const m = new AssemblyMemoryMapping();
  m.set(ASM_MEM_CONST(ASM_CONST(1)), ASM_MEM_CONST(ASM_CONST(2)));
  expect(m.size).toBe(1);
  expect(m.get(ASM_MEM_CONST(ASM_CONST(1)))).toEqual(ASM_MEM_CONST(ASM_CONST(2)));
  expect(m.get(ASM_MEM_CONST(ASM_CONST(2)))).toBeUndefined();
});
