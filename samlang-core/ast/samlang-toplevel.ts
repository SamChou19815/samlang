import type { Type, FunctionType, Range, ModuleReference, Node } from './common-nodes';
import type { SamlangExpression } from './samlang-expressions';

export type AnnotatedVariable = {
  readonly name: string;
  readonly nameRange: Range;
  readonly type: Type;
  readonly typeRange: Range;
};

export interface ClassMemberDeclaration extends Node {
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly nameRange: Range;
  readonly name: string;
  readonly typeParameters: readonly string[];
  readonly type: FunctionType;
  readonly parameters: readonly AnnotatedVariable[];
}

export interface ClassMemberDefinition extends ClassMemberDeclaration {
  readonly body: SamlangExpression;
}

export interface FieldType {
  readonly type: Type;
  readonly isPublic: boolean;
}

export interface TypeDefinition extends Node {
  readonly type: 'object' | 'variant';
  /** A list of fields. Used for ordering during codegen. */
  readonly names: readonly string[];
  readonly mappings: Readonly<Record<string, FieldType | undefined>>;
}

export interface ClassInterface<M extends ClassMemberDeclaration = ClassMemberDeclaration>
  extends Node {
  readonly nameRange: Range;
  readonly name: string;
  readonly isPublic: boolean;
  readonly typeParameters: readonly string[];
  readonly members: readonly M[];
  readonly typeDefinition?: TypeDefinition;
}

export interface ClassDefinition extends ClassInterface<ClassMemberDefinition> {
  readonly typeDefinition: TypeDefinition;
}

export interface ModuleMembersImport extends Node {
  readonly importedMembers: readonly (readonly [string, Range])[];
  readonly importedModule: ModuleReference;
  readonly importedModuleRange: Range;
}

export interface SamlangModule {
  readonly imports: readonly ModuleMembersImport[];
  readonly classes: readonly ClassDefinition[];
}
