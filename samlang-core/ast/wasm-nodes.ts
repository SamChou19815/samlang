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
  readonly __type__: 'WebAssemblyIfElseInstruction';
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

export const WasmConst = (value: number): WebAssemblyConstInstruction => ({
  __type__: 'WebAssemblyConstInstruction',
  value,
});

export const WasmDrop: WebAssemblyDropInstruction = {
  __type__: 'WebAssemblyDropInstruction',
};

export const WasmBinary = (operator: IROperator): WebAssemblyBinaryInstruction => ({
  __type__: 'WebAssemblyBinaryInstruction',
  operator,
});

export const WasmLoad = (index: number): WebAssemblyLoadInstruction => ({
  __type__: 'WebAssemblyLoadInstruction',
  index,
});

export const WasmStore = (index: number): WebAssemblyStoreInstruction => ({
  __type__: 'WebAssemblyStoreInstruction',
  index,
});

export const WasmDirectCall = (functionName: string): WebAssemblyFunctionDirectCallInstruction => ({
  __type__: 'WebAssemblyFunctionDirectCallInstruction',
  functionName,
});

export const WasmIndirectCall = (
  functionNameIndex: number,
  functionTypeString: string
): WebAssemblyFunctionIndirectCallInstruction => ({
  __type__: 'WebAssemblyFunctionIndirectCallInstruction',
  functionNameIndex,
  functionTypeString,
});

export const WasmIfElse = (
  s1: readonly WebAssemblyInstruction[],
  s2: readonly WebAssemblyInstruction[]
): WebAssemblyIfElseInstruction => ({
  __type__: 'WebAssemblyIfElseInstruction',
  s1,
  s2,
});

export const WasmJump = (label: string): WebAssemblyUnconditionalJumpInstruction => ({
  __type__: 'WebAssemblyUnconditionalJumpInstruction',
  label,
});

export const WasmLoop = ({
  continueLabel,
  exitLabel,
  instructions,
}: Omit<WebAssemblyLoopInstruction, '__type__'>): WebAssemblyLoopInstruction => ({
  __type__: 'WebAssemblyLoopInstruction',
  continueLabel,
  exitLabel,
  instructions,
});
