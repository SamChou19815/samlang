import type { HighIRStatement } from './hir-expressions';
import type { HighIRType } from './hir-types';

export interface HighIRTypeDefinition {
  readonly identifier: string;
  readonly mappings: readonly HighIRType[];
}

export interface HighIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly hasReturn: boolean;
  readonly body: readonly HighIRStatement[];
}

export interface HighIRModule {
  readonly typeDefinitions: readonly HighIRTypeDefinition[];
  readonly functions: readonly HighIRFunction[];
}
