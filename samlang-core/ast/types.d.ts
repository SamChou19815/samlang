export interface Position {
  readonly line: number;
  readonly character: number;
}

export type ModuleReference = readonly string[] & { __BRAND__: 'ModuleReference' };
export function ModuleReference(parts: readonly string[]): ModuleReference;

export class Range {
  static readonly DUMMY: Range;
  constructor(public readonly start: Position, public readonly end: Position);
  readonly containsPosition: (position: Position) => boolean;
  readonly containsRange: (range: Range) => boolean;
  readonly union: (range: Range) => Range;
  readonly toString: () => string;
}

export interface Location {
  readonly moduleReference: ModuleReference;
  readonly range: Range;
}
