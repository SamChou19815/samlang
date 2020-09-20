import { AssemblyMemoryMapping } from '../asm-memory-mapping';

import { ASM_CONST, ASM_MEM_CONST } from 'samlang-core-ast/asm-arguments';

it('AssemblyMemoryMapping self consistency test', () => {
  const m = new AssemblyMemoryMapping();
  m.set(ASM_MEM_CONST(ASM_CONST(1)), ASM_MEM_CONST(ASM_CONST(2)));
  expect(m.size).toBe(1);
  expect(m.get(ASM_MEM_CONST(ASM_CONST(1)))).toEqual(ASM_MEM_CONST(ASM_CONST(2)));
  expect(m.get(ASM_MEM_CONST(ASM_CONST(2)))).toBeUndefined();
});
