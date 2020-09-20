import { AssemblyInstruction, assemblyInstructionToString } from './asm-instructions';
import { ENCODED_COMPILED_PROGRAM_MAIN } from './common-names';
import type { GlobalVariable } from './common-nodes';

export type AssemblyProgram = {
  readonly globalVariables: readonly GlobalVariable[];
  readonly instructions: readonly AssemblyInstruction[];
};

const instructionToString = (instruction: AssemblyInstruction): string => {
  if (instruction.__type__ === 'AssemblyLabel') {
    return assemblyInstructionToString(instruction);
  }
  if (instruction.__type__ === 'AssemblySetOnFlag') {
    return assemblyInstructionToString(instruction)
      .split('\n')
      .map((it) => `    ${it}`)
      .join('\n');
  }
  return `    ${assemblyInstructionToString(instruction)}`;
};

const globalVariableToString = ({ name, content }: GlobalVariable): string => `    .data
    .align 8
${name}:
    .quad ${content.length}
${Array.from(content)
  .map((it) => `    .quad ${it.charCodeAt(0)} ## ${it}`)
  .join('\n')}
    .text`;

export const assemblyProgramToString = (program: AssemblyProgram): string => `    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl ${ENCODED_COMPILED_PROGRAM_MAIN}
${program.instructions.map(instructionToString).join('\n')}
${program.globalVariables.map(globalVariableToString).join('\n')}
`;
