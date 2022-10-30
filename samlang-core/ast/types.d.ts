export interface Position {
  readonly line: number;
  readonly character: number;
}

export type ModuleReference = readonly string[] & { __BRAND__: "ModuleReference" };
export function ModuleReference(parts: readonly string[]): ModuleReference;

export class Location {
  static readonly DUMMY: Location;
  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly start: Position,
    public readonly end: Position,
  );
  readonly containsPosition: (position: Position) => boolean;
  readonly contains: (other: Location) => boolean;
  readonly union: (other: Location) => Location;
  readonly toString: () => string;
}
