import type { IROperator } from './common-operators';

export interface WebAssemblyBaseInstruction {
  readonly __type__: string;
}

export interface WebAssemblyConstInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyConstInstruction';
  readonly value: number;
}

export interface WebAssemblyDropInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyDropInstruction';
}

export interface WebAssemblyBinaryInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyBinaryInstruction';
  readonly operator: IROperator;
}

export interface WebAssemblyLoadInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLoadInstruction';
  readonly index: number;
}

export interface WebAssemblyStoreInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyStoreInstruction';
  readonly index: number;
}

export interface WebAssemblyFunctionDirectCallInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionDirectCallInstruction';
  readonly functionName: string;
}

export interface WebAssemblyFunctionIndirectCallInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionIndirectCallInstruction';
  readonly functionNameIndex: number;
  readonly functionTypeString: string;
}

export interface WebAssemblyIfElseInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionIndirectCallInstruction';
  readonly s1: readonly WebAssemblyInstruction[];
  readonly s2: readonly WebAssemblyInstruction[];
}

export interface WebAssemblyUnconditionalJumpInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyUnconditionalJumpInstruction';
  readonly label: string;
}

export interface WebAssemblyLoopInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLoopInstruction';
  readonly continueLabel: string;
  readonly exitLabel: string;
  readonly instructions: readonly WebAssemblyInstruction[];
}

export type WebAssemblyInstruction =
  | WebAssemblyConstInstruction
  | WebAssemblyDropInstruction
  | WebAssemblyBinaryInstruction
  | WebAssemblyLoadInstruction
  | WebAssemblyStoreInstruction
  | WebAssemblyFunctionDirectCallInstruction
  | WebAssemblyFunctionIndirectCallInstruction
  | WebAssemblyIfElseInstruction
  | WebAssemblyUnconditionalJumpInstruction
  | WebAssemblyLoopInstruction;
