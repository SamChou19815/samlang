import { GlobalVariable } from '../common/structs';
import { AssemblyInstruction } from './asm-instructions';

export type AssemblyProgram = {
  readonly globalVariables: readonly GlobalVariable[];
  readonly publicFunctions: readonly string[];
  readonly instructions: readonly AssemblyInstruction[];
};
