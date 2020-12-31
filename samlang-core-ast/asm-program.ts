import { AssemblyInstruction, assemblyInstructionToString } from './asm-instructions';
import { ENCODED_COMPILED_PROGRAM_MAIN } from './common-names';
import type { GlobalVariable } from './common-nodes';

export type AssemblyProgram = {
  readonly globalVariables: readonly GlobalVariable[];
  readonly instructions: readonly AssemblyInstruction[];
};

const instructionToString = (instruction: AssemblyInstruction, isLinux: boolean): string => {
  if (instruction.__type__ === 'AssemblyLabel') {
    return assemblyInstructionToString(instruction, isLinux);
  }
  if (instruction.__type__ === 'AssemblySetOnFlag') {
    return assemblyInstructionToString(instruction, isLinux)
      .split('\n')
      .map((it) => `    ${it}`)
      .join('\n');
  }
  return `    ${assemblyInstructionToString(instruction, isLinux)}`;
};

const globalVariableToString = ({ name, content }: GlobalVariable): string => `    .data
    .align 8
${name}:
    .quad ${content.length}
${Array.from(content)
  .map((it) => `    .quad ${it.charCodeAt(0)} ## ${it}`)
  .join('\n')}
    .text`;

export const assemblyProgramToString = (
  program: AssemblyProgram,
  isLinux = false
): string => `    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl ${isLinux ? ENCODED_COMPILED_PROGRAM_MAIN.substring(1) : ENCODED_COMPILED_PROGRAM_MAIN}
${program.instructions.map((it) => instructionToString(it, isLinux)).join('\n')}
${program.globalVariables.map(globalVariableToString).join('\n')}
`;
