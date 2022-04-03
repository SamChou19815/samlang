import {
  FALSE,
  intLiteralOf,
  ModuleReference,
  moduleReferenceToFileName,
  moduleReferenceToString,
  Position,
  prettyPrintLiteral,
  Range,
  stringLiteralOf,
  TRUE,
} from '../common-nodes';

describe('common-nodes', () => {
  it('Literals have expected pretty printed values', () => {
    expect(prettyPrintLiteral(TRUE)).toBe('true');
    expect(prettyPrintLiteral(FALSE)).toBe('false');
    expect(prettyPrintLiteral(intLiteralOf(42))).toBe('42');
    expect(prettyPrintLiteral(stringLiteralOf('hello'))).toBe('"hello"');
  });

  it('Range.toString() works as expected', () => {
    expect(Range.DUMMY.toString()).toBe('0:0-0:0');
    expect(new Range(Position(1, 1), Position(2, 4)).toString()).toBe('2:2-3:5');
  });

  it('Range.containsPosition() works as expected', () => {
    expect(new Range(Position(1, 3), Position(3, 1)).containsPosition(Position(2, 2))).toBeTruthy();
    expect(new Range(Position(1, 3), Position(3, 1)).containsPosition(Position(1, 2))).toBeFalsy();
    expect(new Range(Position(1, 3), Position(3, 1)).containsPosition(Position(3, 2))).toBeFalsy();
  });

  it('Range.containsRange() works as expected', () => {
    expect(
      new Range(Position(1, 3), Position(3, 1)).containsRange(
        new Range(Position(1, 3), Position(3, 1))
      )
    ).toBeTruthy();
    expect(
      new Range(Position(1, 3), Position(3, 1)).containsRange(
        new Range(Position(1, 4), Position(3, 0))
      )
    ).toBeTruthy();
    expect(
      new Range(Position(1, 3), Position(3, 1)).containsRange(
        new Range(Position(1, 3), Position(3, 2))
      )
    ).toBeFalsy();
    expect(
      new Range(Position(1, 3), Position(3, 1)).containsRange(
        new Range(Position(1, 2), Position(3, 1))
      )
    ).toBeFalsy();
    expect(
      new Range(Position(1, 3), Position(3, 1)).containsRange(
        new Range(Position(1, 2), Position(3, 2))
      )
    ).toBeFalsy();
  });

  it('Range.union() works as expected', () => {
    expect(
      new Range(Position(1, 3), Position(3, 1))
        .union(new Range(Position(2, 3), Position(4, 1)))
        .toString()
    ).toBe(new Range(Position(1, 3), Position(4, 1)).toString());

    expect(
      new Range(Position(2, 3), Position(4, 1))
        .union(new Range(Position(1, 3), Position(3, 1)))
        .toString()
    ).toBe(new Range(Position(1, 3), Position(4, 1)).toString());

    expect(
      new Range(Position(1, 3), Position(2, 3))
        .union(new Range(Position(3, 1), Position(4, 1)))
        .toString()
    ).toBe(new Range(Position(1, 3), Position(4, 1)).toString());

    expect(
      new Range(Position(3, 1), Position(4, 1))
        .union(new Range(Position(1, 3), Position(2, 3)))
        .toString()
    ).toBe(new Range(Position(1, 3), Position(4, 1)).toString());
  });

  it('moduleReferenceToString', () => {
    expect(moduleReferenceToString(ModuleReference.DUMMY)).toBe('__DUMMY__');
    expect(moduleReferenceToString(ModuleReference(['Foo']))).toBe('Foo');
    expect(moduleReferenceToString(ModuleReference(['Foo', 'Bar']))).toBe('Foo.Bar');
  });

  it('moduleReferenceToFilename', () => {
    expect(moduleReferenceToFileName(ModuleReference.DUMMY)).toBe('__DUMMY__.sam');
    expect(moduleReferenceToFileName(ModuleReference(['Foo']))).toBe('Foo.sam');
    expect(moduleReferenceToFileName(ModuleReference(['Foo', 'Bar']))).toBe('Foo/Bar.sam');
  });
});
