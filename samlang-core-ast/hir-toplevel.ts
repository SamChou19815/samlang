import type { ModuleReference, Type } from './common-nodes';
import type { HighIRStatement } from './hir-expressions';

export interface HighIRTypeDefinition {
  readonly moduleReference: ModuleReference;
  readonly identifier: string;
  readonly mappings: readonly Type[];
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
