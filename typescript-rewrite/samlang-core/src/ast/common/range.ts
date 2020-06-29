import Position from './position';

export default class Range {
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
}
