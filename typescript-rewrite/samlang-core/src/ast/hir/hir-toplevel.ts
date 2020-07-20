import type { HighIRStatement } from './hir-expressions';

export interface HighIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly hasReturn: boolean;
  readonly body: readonly HighIRStatement[];
}

export interface HighIRModule {
  readonly functions: readonly HighIRFunction[];
}
