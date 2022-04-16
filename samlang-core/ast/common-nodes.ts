import {
  assert,
  CollectionsConstructors,
  createCollectionConstructors,
  ReadonlyHashMap,
} from '../utils';
import type {
  Location as ILocation,
  ModuleReference as IModuleReference,
  Position as IPosition,
} from './types';

/** SECTION 1: Literals */

/** A boolean literal, like `true` or `false`.  */
export type BoolLiteral = { readonly type: 'BoolLiteral'; readonly value: boolean };
/** An int literal, like 42. */
export type IntLiteral = { readonly type: 'IntLiteral'; readonly value: number };

/** A string literal, like `"Answer to life, universe, and everything"`. */
export type StringLiteral = { readonly type: 'StringLiteral'; readonly value: string };
export type Literal = IntLiteral | StringLiteral | BoolLiteral;

export const TRUE: BoolLiteral = { type: 'BoolLiteral', value: true };
export const FALSE: BoolLiteral = { type: 'BoolLiteral', value: false };

export const intLiteralOf = (value: number): IntLiteral => ({
  type: 'IntLiteral',
  value,
});
export const stringLiteralOf = (value: string): StringLiteral => ({
  type: 'StringLiteral',
  value,
});

export function prettyPrintLiteral(literal: Literal): string {
  switch (literal.type) {
    case 'BoolLiteral':
    case 'IntLiteral':
      return String(literal.value);
    case 'StringLiteral':
      return `"${literal.value}"`;
  }
}

/** SECTION 2: Locations */

export type Position = IPosition;
export const Position = (line: number, character: number): Position => ({ line, character });

const DUMMY_POSITION: Position = { line: -1, character: -1 };

function comparePosition(p1: Position, p2: Position): number {
  const c = p1.line - p2.line;
  return c !== 0 ? c : p1.character - p2.character;
}

/**
 * Reference to a samlang module.
 * This class, instead of a filename string, should be used to point to a module during type checking
 * and code generation.
 */
export type ModuleReference = IModuleReference;

export function ModuleReference(parts: readonly string[]): ModuleReference {
  return parts as ModuleReference;
}
/**
 * The root module that can never be referenced in the source code.
 * It can be used as a starting point for cyclic dependency analysis,
 * since it cannot be named according to the syntax so no module can depend on it.
 */
ModuleReference.ROOT = ModuleReference([]);
/** A dummy module reference for testing. */
ModuleReference.DUMMY = ModuleReference(['__DUMMY__']);

export const moduleReferenceToString = (moduleReference: ModuleReference): string =>
  moduleReference.join('.');

export const moduleReferenceToFileName = (moduleReference: ModuleReference): string =>
  `${moduleReference.join('/')}.sam`;

export const ModuleReferenceCollections: CollectionsConstructors<ModuleReference> =
  createCollectionConstructors(moduleReferenceToString);

export class Location implements ILocation {
  static readonly DUMMY: Location = new Location(
    ModuleReference.DUMMY,
    DUMMY_POSITION,
    DUMMY_POSITION
  );

  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly start: Position,
    public readonly end: Position
  ) {}

  readonly containsPosition = (position: Position): boolean =>
    comparePosition(this.start, position) <= 0 && comparePosition(this.end, position) >= 0;

  readonly contains = (other: ILocation): boolean =>
    this.containsPosition(other.start) && this.containsPosition(other.end);

  readonly union = (other: ILocation): ILocation => {
    assert(
      moduleReferenceToString(this.moduleReference) ===
        moduleReferenceToString(other.moduleReference)
    );
    const start = comparePosition(this.start, other.start) < 0 ? this.start : other.start;
    const end = comparePosition(this.end, other.end) > 0 ? this.end : other.end;
    return new Location(this.moduleReference, start, end);
  };

  readonly toString = (): string => {
    const file = moduleReferenceToFileName(this.moduleReference);
    const start = `${this.start.line + 1}:${this.start.character + 1}`;
    const end = `${this.end.line + 1}:${this.end.character + 1}`;
    return `${file}:${start}-${end}`;
  };
}

export const LocationCollections: CollectionsConstructors<Location> = createCollectionConstructors(
  (location) => location.toString()
);

/** SECTION 3: REASON */

export interface SamlangReason {
  readonly definitionLocation: Location;
  readonly annotationLocation: Location | null;
}

export const SourceReason = (
  definitionLocation: Location,
  annotationLocation: Location | null
): SamlangReason => ({ definitionLocation, annotationLocation });

export function defReasonToUseReason(reason: SamlangReason, useLocation: Location): SamlangReason {
  return { definitionLocation: useLocation, annotationLocation: reason.annotationLocation };
}

export const DummySourceReason: SamlangReason = SourceReason(Location.DUMMY, Location.DUMMY);
// TODO(reason): Wait until we migrate to location only.
export const BuiltinReason: SamlangReason = DummySourceReason;

/** SECTION 4: MISC */

export type TypedComment = {
  readonly type: 'line' | 'block' | 'doc';
  /** The text in the comment, excluding the comment markers. */
  readonly text: string;
};

/** A common interface for all AST nodes. */
export interface Node {
  readonly location: Location;
}

export interface GlobalVariable {
  readonly name: string;
  readonly content: string;
}

export type Sources<M> = ReadonlyHashMap<ModuleReference, M>;
