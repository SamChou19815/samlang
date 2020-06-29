import type { ReadonlyHashMap } from '../../util/collections';
import type ModuleReference from './ModuleReference';
import type Range from './Range';
import type { Type } from './types';

/** A common interface for all AST nodes. */
export interface Node {
  /** The range of the entire node. */
  readonly range: Range;
}

export interface Location {
  readonly moduleReference: ModuleReference;
  readonly range: Range;
}

export interface ModuleMembersImport extends Node {
  readonly importedMembers: readonly [readonly [string, Range]][];
  readonly importedModule: ModuleReference;
  readonly importedModuleRange: Range;
}

export interface GlobalVariable {
  readonly name: string;
  readonly content: string;
}

export interface StringGlobalVariable {
  readonly referenceVariable: GlobalVariable;
  readonly contentVariable: GlobalVariable;
  readonly content: string;
}

export interface AnnotatedParameter {
  readonly name: string;
  readonly nameRange: Range;
  readonly type: Type;
  readonly typeRange: Range;
}

export interface FieldType {
  readonly type: Type;
  readonly isPublic: boolean;
}

export interface TypeDefinition extends Node {
  readonly type: 'object' | 'variant';
  readonly typeParameters: readonly string[];
  /** A list of fields. Used for ordering during codegen. */
  readonly names: readonly string[];
  readonly mappings: Readonly<Record<string, FieldType | undefined>>;
}

export type Sources<M> = ReadonlyHashMap<ModuleReference, M>;
