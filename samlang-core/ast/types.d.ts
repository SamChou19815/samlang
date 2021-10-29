export interface Position {
  readonly line: number;
  readonly character: number;
}

export class Range {
  static readonly DUMMY: Range;
  constructor(public readonly start: Position, public readonly end: Position);
  readonly containsPosition: (position: Position) => boolean;
  readonly containsRange: (range: Range) => boolean;
  readonly union: (range: Range) => Range;
  readonly toString: () => string;
  uniqueHash(): string;
}

export class ModuleReference {
  constructor(public readonly parts: readonly string[]) {}
  readonly toString: () => string;
  readonly toFilename: () => string;
  uniqueHash(): string;
}

export interface Location {
  readonly moduleReference: ModuleReference;
  readonly range: Range;
}
