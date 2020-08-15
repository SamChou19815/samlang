import type Range from '../common/range';
import type {
  AnnotatedParameter,
  ModuleMembersImport,
  TypeDefinition,
  Node,
} from '../common/structs';
import { FunctionType } from '../common/types';
import { SamlangExpression } from './samlang-expressions';

export interface ClassMemberDeclaration extends Node {
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly nameRange: Range;
  readonly name: string;
  readonly typeParameters: readonly string[];
  readonly type: FunctionType;
  readonly parameters: readonly AnnotatedParameter[];
}

export interface ClassMemberDefinition extends ClassMemberDeclaration {
  readonly body: SamlangExpression;
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

export interface SamlangModule {
  readonly imports: readonly ModuleMembersImport[];
  readonly classes: readonly ClassDefinition[];
}
