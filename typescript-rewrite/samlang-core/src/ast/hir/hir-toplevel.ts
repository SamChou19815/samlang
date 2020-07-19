import type { ModuleMembersImport } from '../common/structs';
import type { HighIRStatement } from './hir-expressions';

export interface HighIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly hasReturn: boolean;
  readonly body: readonly HighIRStatement[];
}

export interface HighIRClassDefinition {
  readonly className: string;
  readonly members: readonly HighIRFunction[];
}

export interface HighIRModule {
  readonly imports: readonly ModuleMembersImport[];
  readonly classDefinitions: readonly HighIRClassDefinition[];
}
