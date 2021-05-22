import type { Range, Node, Type } from './common-nodes';

export interface TuplePattern extends Node {
  readonly type: 'TuplePattern';
  readonly destructedNames: readonly {
    readonly name?: string;
    readonly type: Type;
    readonly range: Range;
  }[];
}

export interface ObjectPatternDestucturedName {
  readonly fieldName: string;
  readonly fieldNameRange: Range;
  readonly fieldOrder: number;
  readonly type: Type;
  readonly alias?: readonly [string, Range];
  readonly range: Range;
}

export interface ObjectPattern extends Node {
  readonly type: 'ObjectPattern';
  readonly destructedNames: readonly ObjectPatternDestucturedName[];
}

export interface VariablePattern extends Node {
  readonly type: 'VariablePattern';
  readonly name: string;
}

export interface WildCardPattern extends Node {
  readonly type: 'WildCardPattern';
}

export type Pattern = TuplePattern | ObjectPattern | VariablePattern | WildCardPattern;
