import type { AnnotatedParameter, TypeDefinition } from '../common/structs';
import type { FunctionType } from '../common/types';
import type { SamlangExpression } from './expressions';

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
  readonly members: readonly M[];
}

export interface ClassDefinition extends ClassInterface<ClassMemberDefinition> {
  readonly typeDefinition: TypeDefinition;
}
