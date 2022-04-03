import type { ReadonlyHashMap } from '../utils';
import type {
  ModuleReference as IModuleReference,
  Position as IPosition,
  Range as IRange,
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

export class Range implements IRange {
  static readonly DUMMY: Range = new Range(DUMMY_POSITION, DUMMY_POSITION);

  constructor(public readonly start: Position, public readonly end: Position) {}

  readonly containsPosition = (position: Position): boolean =>
    comparePosition(this.start, position) <= 0 && comparePosition(this.end, position) >= 0;

  readonly containsRange = (range: IRange): boolean =>
    this.containsPosition(range.start) && this.containsPosition(range.end);

  readonly union = (range: IRange): IRange => {
    const start = comparePosition(this.start, range.start) < 0 ? this.start : range.start;
    const end = comparePosition(this.end, range.end) > 0 ? this.end : range.end;
    return new Range(start, end);
  };

  readonly toString = (): string =>
    `${this.start.line + 1}:${this.start.character + 1}-${this.end.line + 1}:${
      this.end.character + 1
    }`;

  uniqueHash(): string {
    return this.toString();
  }
}

/**
 * Reference to a samlang module.
 * This class, instead of a filename string, should be used to point to a module during type checking
 * and code generation.
 */
export class ModuleReference implements IModuleReference {
  /**
   * The root module that can never be referenced in the source code.
   * It can be used as a starting point for cyclic dependency analysis,
   * since it cannot be named according to the syntax so no module can depend on it.
   */
  static readonly ROOT: ModuleReference = new ModuleReference([]);
  /** A dummy module reference for testing. */
  static readonly DUMMY: ModuleReference = new ModuleReference(['__DUMMY__']);

  constructor(public readonly parts: readonly string[]) {}

  readonly toString = (): string => this.parts.join('.');

  readonly toFilename = (): string => `${this.parts.join('/')}.sam`;

  readonly uniqueHash = (): string => this.toString();
}

export interface Location {
  readonly moduleReference: ModuleReference;
  readonly range: Range;
}

/** SECTION 3: REASON */

export interface SamlangReason {
  readonly definitionLocation: Range;
  readonly annotationLocation: Range | null;
}

export const SourceReason = (
  definitionLocation: Range,
  annotationLocation: Range | null
): SamlangReason => ({ definitionLocation, annotationLocation });

export const DummySourceReason: SamlangReason = SourceReason(Range.DUMMY, Range.DUMMY);
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
  /** The range of the entire node. */
  readonly range: Range;
}

export interface GlobalVariable {
  readonly name: string;
  readonly content: string;
}

export type Sources<M> = ReadonlyHashMap<ModuleReference, M>;
