import { Long, checkNotNull, Hashable, ReadonlyHashMap } from 'samlang-core-utils';

/** SECTION 1: Literals */

/** A boolean literal, like `true` or `false`.  */
export type BoolLiteral = { readonly type: 'BoolLiteral'; readonly value: boolean };
/** An int literal, like 42. */
export type IntLiteral = { readonly type: 'IntLiteral'; readonly value: Long };

/** A string literal, like `"Answer to life, universe, and everything"`. */
export type StringLiteral = { readonly type: 'StringLiteral'; readonly value: string };
export type Literal = IntLiteral | StringLiteral | BoolLiteral;

export const TRUE: BoolLiteral = { type: 'BoolLiteral', value: true };
export const FALSE: BoolLiteral = { type: 'BoolLiteral', value: false };

export const intLiteralOf = (value: Long): IntLiteral => ({
  type: 'IntLiteral',
  value,
});
export const stringLiteralOf = (value: string): StringLiteral => ({
  type: 'StringLiteral',
  value,
});

export const prettyPrintLiteral = (literal: Literal): string => {
  switch (literal.type) {
    case 'BoolLiteral':
    case 'IntLiteral':
      return String(literal.value);
    case 'StringLiteral':
      return `"${literal.value}"`;
  }
};

/** SECTION 2: Types */

export type PrimitiveTypeName = 'unit' | 'bool' | 'int' | 'string';

export type PrimitiveType = { readonly type: 'PrimitiveType'; readonly name: PrimitiveTypeName };

export type IdentifierType = {
  readonly type: 'IdentifierType';
  readonly moduleReference: ModuleReference;
  readonly identifier: string;
  readonly typeArguments: readonly Type[];
};

export type TupleType = { readonly type: 'TupleType'; readonly mappings: readonly Type[] };

export type FunctionType = {
  readonly type: 'FunctionType';
  readonly argumentTypes: readonly Type[];
  readonly returnType: Type;
};

export type UndecidedType = { readonly type: 'UndecidedType'; readonly index: number };

export type Type = PrimitiveType | IdentifierType | TupleType | FunctionType | UndecidedType;

export const unitType: PrimitiveType = { type: 'PrimitiveType', name: 'unit' };
export const boolType: PrimitiveType = { type: 'PrimitiveType', name: 'bool' };
export const intType: PrimitiveType = { type: 'PrimitiveType', name: 'int' };
export const stringType: PrimitiveType = { type: 'PrimitiveType', name: 'string' };

export const identifierType = (
  moduleReference: ModuleReference,
  identifier: string,
  typeArguments: readonly Type[] = []
): IdentifierType => ({
  type: 'IdentifierType',
  moduleReference,
  identifier,
  typeArguments,
});

export const tupleType = (mappings: readonly Type[]): TupleType => ({
  type: 'TupleType',
  mappings,
});

export const functionType = (argumentTypes: readonly Type[], returnType: Type): FunctionType => ({
  type: 'FunctionType',
  argumentTypes,
  returnType,
});

export class UndecidedTypes {
  private static nextUndecidedTypeIndex = 0;

  static next(): UndecidedType {
    const type = { type: 'UndecidedType', index: UndecidedTypes.nextUndecidedTypeIndex } as const;
    UndecidedTypes.nextUndecidedTypeIndex += 1;
    return type;
  }

  static nextN(n: number): readonly UndecidedType[] {
    const list: UndecidedType[] = [];
    for (let i = 0; i < n; i += 1) {
      list.push(UndecidedTypes.next());
    }
    return list;
  }

  // eslint-disable-next-line camelcase
  static resetUndecidedTypeIndex_ONLY_FOR_TEST(): void {
    UndecidedTypes.nextUndecidedTypeIndex = 0;
  }
}

export const prettyPrintType = (type: Type): string => {
  switch (type.type) {
    case 'PrimitiveType':
      return type.name;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return type.identifier;
      }
      return `${type.identifier}<${type.typeArguments.map(prettyPrintType).join(', ')}>`;
    case 'TupleType':
      return `[${type.mappings.map(prettyPrintType).join(' * ')}]`;
    case 'FunctionType':
      return `(${type.argumentTypes.map(prettyPrintType).join(', ')}) -> ${prettyPrintType(
        type.returnType
      )}`;
    case 'UndecidedType':
      return '__UNDECIDED__';
  }
};

export const isTheSameType = (t1: Type, t2: Type): boolean => {
  switch (t1.type) {
    case 'PrimitiveType':
      return t2.type === 'PrimitiveType' && t1.name === t2.name;
    case 'IdentifierType':
      return (
        t2.type === 'IdentifierType' &&
        t1.moduleReference.toString() === t2.moduleReference.toString() &&
        t1.identifier === t2.identifier &&
        t1.typeArguments.length === t2.typeArguments.length &&
        t1.typeArguments.every((t1Argument, index) =>
          isTheSameType(t1Argument, checkNotNull(t2.typeArguments[index]))
        )
      );
    case 'TupleType':
      return (
        t2.type === 'TupleType' &&
        t1.mappings.length === t2.mappings.length &&
        t1.mappings.every((t1Element, index) =>
          isTheSameType(t1Element, checkNotNull(t2.mappings[index]))
        )
      );
    case 'FunctionType':
      return (
        t2.type === 'FunctionType' &&
        isTheSameType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        t1.argumentTypes.every((t1Argument, index) =>
          isTheSameType(t1Argument, checkNotNull(t2.argumentTypes[index]))
        )
      );
    case 'UndecidedType':
      return t2.type === 'UndecidedType' && t1.index === t2.index;
  }
};

/** SECTION 3: Locations */

export class Position {
  static readonly DUMMY: Position = new Position(-1, -1);

  constructor(public readonly line: number, public readonly column: number) {}

  readonly compareTo = (other: Position): number => {
    const c = this.line - other.line;
    return c !== 0 ? c : this.column - other.column;
  };

  readonly toString = (): string => `${this.line + 1}:${this.column + 1}`;
}

export class Range implements Hashable {
  static readonly DUMMY: Range = new Range(Position.DUMMY, Position.DUMMY);

  constructor(public readonly start: Position, public readonly end: Position) {}

  readonly containsPosition = (position: Position): boolean =>
    this.start.compareTo(position) <= 0 && this.end.compareTo(position) >= 0;

  readonly containsRange = (range: Range): boolean =>
    this.containsPosition(range.start) && this.containsPosition(range.end);

  readonly union = (range: Range): Range => {
    const start = this.start.compareTo(range.start) < 0 ? this.start : range.start;
    const end = this.end.compareTo(range.end) > 0 ? this.end : range.end;
    return new Range(start, end);
  };

  readonly toString = (): string => `${this.start}-${this.end}`;

  uniqueHash(): string {
    return this.toString();
  }
}

/**
 * Reference to a samlang module.
 * This class, instead of a filename string, should be used to point to a module during type checking
 * and code generation.
 */
export class ModuleReference implements Hashable {
  /**
   * The root module that can never be referenced in the source code.
   * It can be used as a starting point for cyclic dependency analysis,
   * since it cannot be named according to the syntax so no module can depend on it.
   */
  static readonly ROOT: ModuleReference = new ModuleReference([]);

  constructor(public readonly parts: readonly string[]) {}

  readonly toString = (): string => this.parts.join('.');

  readonly toFilename = (): string => `${this.parts.join('/')}.sam`;

  readonly uniqueHash = (): string => this.toString();
}

export interface Location {
  readonly moduleReference: ModuleReference;
  readonly range: Range;
}

/** SECTION 4: MISC */

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
