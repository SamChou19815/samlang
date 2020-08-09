import {
  RAX,
  RBX,
  RCX,
  RDX,
  RSI,
  RDI,
  RSP,
  RBP,
  RIP,
  R8,
  R9,
  R10,
  R11,
  R12,
  R13,
  R14,
  R15,
  ASM_REG,
  AssemblyMemory,
  ASM_MEM_REG_WITH_CONST,
  ASM_CONST,
} from '../../ast/asm/asm-arguments';
import { AssemblyInstruction, ASM_MOVE_REG, ASM_COMMENT } from '../../ast/asm/asm-instructions';
import { AssemblyMemoryMapping } from './asm-memory-mapping';

/**
 * The coloring problem constant.
 * The number comes from 16 - 2, where 16 refers to 16 GPR and 2 refers to RSP and RBP that are
 * not considered to be suitable for use.
 * The list is shown below.
 */
export const AVAILABLE_REGISTERS_NUMBER = 14;

/** The set of registers that is OK to use for coloring temporary registers. */
export const AVAILABLE_REGISTERS: ReadonlySet<string> = new Set([
  RAX.id,
  RBX.id,
  RCX.id,
  RDX.id,
  RSI.id,
  RDI.id,
  R8.id,
  R9.id,
  R10.id,
  R11.id,
  R12.id,
  R13.id,
  R14.id,
  R15.id,
]);

/** Machine registers, preassigned a color. The color is the same as the register name. */
export const PRE_COLORED_REGISTERS: ReadonlySet<string> = new Set([
  RIP.id,
  RAX.id,
  RBX.id,
  RCX.id,
  RDX.id,
  RSI.id,
  RDI.id,
  RSP.id,
  RBP.id,
  R8.id,
  R9.id,
  R10.id,
  R11.id,
  R12.id,
  R13.id,
  R14.id,
  R15.id,
]);

/** A set of callee-saved registers, available for use. */
export const CALLEE_SAVED_REGISTERS: ReadonlySet<string> = new Set([
  RBX.id,
  R12.id,
  R13.id,
  R14.id,
  R15.id,
]);

const CALLER_SAVED_REGISTERS_MAPPING = {
  RBX_CALLEE_SAVED_STORAGE: RBX,
  R12_CALLEE_SAVED_STORAGE: R12,
  R13_CALLEE_SAVED_STORAGE: R13,
  R14_CALLEE_SAVED_STORAGE: R14,
  R15_CALLEE_SAVED_STORAGE: R15,
};

export const rewriteAssemblyInstructionsWithCalleeSavedRegistersMoves = (
  instructions: readonly AssemblyInstruction[]
): readonly AssemblyInstruction[] => [
  ...Object.entries(CALLER_SAVED_REGISTERS_MAPPING).map(([storage, machineRegister]) =>
    ASM_MOVE_REG(ASM_REG(storage), machineRegister)
  ),
  ...instructions,
  ...Object.entries(CALLER_SAVED_REGISTERS_MAPPING).map(([storage, machineRegister]) =>
    ASM_MOVE_REG(machineRegister, ASM_REG(storage))
  ),
  ASM_COMMENT('Dummy end of program.'),
];

/**
 * After register allocation, originally inserted callee-saved registers might be unused, so they
 * don't need to take the stack space. This function uses the unused callee-saved registers
 * information to generate a memory rewriting mapping to eliminate those memory slots.
 *
 * @param spilledVariableMappings the spilled var mappings to mutable.
 * @param unusedCalleeSavedRegisters a set of unused callee saved registers as a reference.
 * @returns new mappings from the old mem to new mem.
 */
export const reorganizeSpilledVariableMappingsToRemoveUnusedCalleeSavedRegisterMappings = (
  spilledVariableMappings: ReadonlyMap<string, AssemblyMemory>,
  unusedCalleeSavedRegisters: ReadonlySet<string>
): AssemblyMemoryMapping => {
  const usedOldMemory: AssemblyMemory[] = [];
  spilledVariableMappings.forEach((memory, name) => {
    if (unusedCalleeSavedRegisters.has(name)) {
      return;
    }
    const { baseRegister, multipleOf, displacementConstant } = memory;
    // istanbul ignore next
    if (
      baseRegister == null ||
      multipleOf != null ||
      displacementConstant == null ||
      baseRegister.id !== RBP.id ||
      typeof displacementConstant.value !== 'number' ||
      displacementConstant.value % 8 !== 0
    ) {
      // istanbul ignore next
      throw new Error();
    }
    usedOldMemory.push(memory);
  });

  const newMappings = new AssemblyMemoryMapping();
  let memoryID = 1;
  usedOldMemory.forEach((oldMemory) => {
    newMappings.set(oldMemory, ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(-8 * memoryID)));
    memoryID += 1;
  });
  return newMappings;
};
