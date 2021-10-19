import type { LanguageServices } from '../services';

// PART 1: Supporting structures

export class Position {
  constructor(public readonly line: number, public readonly column: number);
  readonly compareTo: (other: Position) => number;
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position);
  readonly containsPosition: (position: Position) => boolean;
  readonly containsRange: (range: Range) => boolean;
  readonly union: (range: Range) => Range;
  uniqueHash(): string;
}

export class ModuleReference {
  constructor(public readonly parts: readonly string[]) {}
  readonly toString: () => string;
  readonly toFilename: () => string;
  uniqueHash(): string;
}

// PART 2: Public APIs

export type SamlangSourcesCompilationResult =
  | {
      readonly __type__: 'OK';
      readonly emittedTypeScriptCode: Readonly<Record<string, string>>;
      readonly emittedLLVMCode: Readonly<Record<string, string>>;
    }
  | { readonly __type__: 'ERROR'; readonly errors: readonly string[] };

export function reformatSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): readonly (readonly [ModuleReference, string])[];

export function compileSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
  entryModuleReferences: readonly ModuleReference[]
): SamlangSourcesCompilationResult;

export type SamlangSingleSourceCompilationResult =
  | {
      readonly __type__: 'OK';
      readonly emittedTypeScriptCode: string;
      readonly emittedLLVMCode: string;
    }
  | { readonly __type__: 'ERROR'; readonly errors: readonly string[] };

export function compileSingleSamlangSource(
  programString: string
): SamlangSingleSourceCompilationResult;

export function createSamlangLanguageService(
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): LanguageServices;
