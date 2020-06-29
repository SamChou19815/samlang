export default class Position {
  static readonly DUMMY: Position = new Position(-1, -1);

  constructor(public readonly line: number, public readonly column: number) {}

  readonly compareTo = (other: Position): number => {
    const c = this.line - other.line;
    return c !== 0 ? c : this.column - other.column;
  };

  readonly toString = (): string => `${this.line + 1}:${this.column + 1}`;
}
