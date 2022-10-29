import { Location, ModuleReference, Position } from "../ast/types";

// PART 1: Supporting structures

export { Position, Location, ModuleReference };

// PART 2: Public APIs

export type SamlangSourcesCompilationResult =
  | { readonly __type__: "OK"; readonly emittedCode: Readonly<Record<string, string | Uint8Array>> }
  | { readonly __type__: "ERROR"; readonly errors: readonly string[] };

export function reformatSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
): readonly (readonly [ModuleReference, string])[];

export function compileSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
  entryModuleReferences: readonly ModuleReference[],
): SamlangSourcesCompilationResult;

export type SamlangSingleSourceCompilationResult =
  | { readonly __type__: "OK"; readonly emittedTSCode: string; readonly interpreterResult: string }
  | { readonly __type__: "ERROR"; readonly errors: readonly string[] };

export function compileSingleSamlangSource(
  programString: string,
): SamlangSingleSourceCompilationResult;
