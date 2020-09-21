import {
  rewriteAssemblyInstructionsWithCalleeSavedRegistersMoves,
  reorganizeSpilledVariableMappingsToRemoveUnusedCalleeSavedRegisterMappings,
} from '../asm-register-allocation-utils';

import { RBP, ASM_CONST, ASM_MEM_REG_WITH_CONST } from 'samlang-core-ast/asm-arguments';
import { assemblyInstructionToString } from 'samlang-core-ast/asm-instructions';

it('rewriteAssemblyInstructionsWithCalleeSavedRegistersMoves test', () => {
  expect(
    rewriteAssemblyInstructionsWithCalleeSavedRegistersMoves([])
      .map(assemblyInstructionToString)
      .join('\n')
  ).toBe(`mov RBX_CALLEE_SAVED_STORAGE, rbx
mov R12_CALLEE_SAVED_STORAGE, r12
mov R13_CALLEE_SAVED_STORAGE, r13
mov R14_CALLEE_SAVED_STORAGE, r14
mov R15_CALLEE_SAVED_STORAGE, r15
mov rbx, RBX_CALLEE_SAVED_STORAGE
mov r12, R12_CALLEE_SAVED_STORAGE
mov r13, R13_CALLEE_SAVED_STORAGE
mov r14, R14_CALLEE_SAVED_STORAGE
mov r15, R15_CALLEE_SAVED_STORAGE
## Dummy end of program.`);
});

it('reorganizeSpilledVariableMappingsToRemoveUnusedCalleeSavedRegisterMappings test', () => {
  const mapping = reorganizeSpilledVariableMappingsToRemoveUnusedCalleeSavedRegisterMappings(
    new Map([
      ['a', ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(8))],
      ['rbx', ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(16))],
    ]),
    new Set(['rbx'])
  );

  expect(mapping.get(ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(8)))).toEqual(
    ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(-8))
  );
  expect(mapping.get(ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(16)))).toBeUndefined();
});
