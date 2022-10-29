import {
  FALSE,
  intLiteralOf,
  Location,
  ModuleReference,
  moduleReferenceToFileName,
  moduleReferenceToString,
  Position,
  prettyPrintLiteral,
  stringLiteralOf,
  TRUE,
} from "../common-nodes";

describe("common-nodes", () => {
  it("Literals have expected pretty printed values", () => {
    expect(prettyPrintLiteral(TRUE)).toBe("true");
    expect(prettyPrintLiteral(FALSE)).toBe("false");
    expect(prettyPrintLiteral(intLiteralOf(42))).toBe("42");
    expect(prettyPrintLiteral(stringLiteralOf("hello"))).toBe('"hello"');
  });

  it("Location.toString() works as expected", () => {
    expect(Location.DUMMY.toString()).toBe("__DUMMY__.sam:0:0-0:0");
    expect(new Location(ModuleReference.DUMMY, Position(1, 1), Position(2, 4)).toString()).toBe(
      "__DUMMY__.sam:2:2-3:5",
    );
  });

  it("Location.containsPosition() works as expected", () => {
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).containsPosition(
        Position(2, 2),
      ),
    ).toBeTruthy();
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).containsPosition(
        Position(1, 2),
      ),
    ).toBeFalsy();
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).containsPosition(
        Position(3, 2),
      ),
    ).toBeFalsy();
  });

  it("Location.contains() works as expected", () => {
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).contains(
        new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)),
      ),
    ).toBeTruthy();
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).contains(
        new Location(ModuleReference.DUMMY, Position(1, 4), Position(3, 0)),
      ),
    ).toBeTruthy();
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).contains(
        new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 2)),
      ),
    ).toBeFalsy();
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).contains(
        new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 1)),
      ),
    ).toBeFalsy();
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)).contains(
        new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 2)),
      ),
    ).toBeFalsy();
  });

  it("Location.union() works as expected", () => {
    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1))
        .union(new Location(ModuleReference.DUMMY, Position(2, 3), Position(4, 1)))
        .toString(),
    ).toBe(new Location(ModuleReference.DUMMY, Position(1, 3), Position(4, 1)).toString());

    expect(
      new Location(ModuleReference.DUMMY, Position(2, 3), Position(4, 1))
        .union(new Location(ModuleReference.DUMMY, Position(1, 3), Position(3, 1)))
        .toString(),
    ).toBe(new Location(ModuleReference.DUMMY, Position(1, 3), Position(4, 1)).toString());

    expect(
      new Location(ModuleReference.DUMMY, Position(1, 3), Position(2, 3))
        .union(new Location(ModuleReference.DUMMY, Position(3, 1), Position(4, 1)))
        .toString(),
    ).toBe(new Location(ModuleReference.DUMMY, Position(1, 3), Position(4, 1)).toString());

    expect(
      new Location(ModuleReference.DUMMY, Position(3, 1), Position(4, 1))
        .union(new Location(ModuleReference.DUMMY, Position(1, 3), Position(2, 3)))
        .toString(),
    ).toBe(new Location(ModuleReference.DUMMY, Position(1, 3), Position(4, 1)).toString());
  });

  it("moduleReferenceToString", () => {
    expect(moduleReferenceToString(ModuleReference.DUMMY)).toBe("__DUMMY__");
    expect(moduleReferenceToString(ModuleReference(["Foo"]))).toBe("Foo");
    expect(moduleReferenceToString(ModuleReference(["Foo", "Bar"]))).toBe("Foo.Bar");
  });

  it("moduleReferenceToFilename", () => {
    expect(moduleReferenceToFileName(ModuleReference.DUMMY)).toBe("__DUMMY__.sam");
    expect(moduleReferenceToFileName(ModuleReference(["Foo"]))).toBe("Foo.sam");
    expect(moduleReferenceToFileName(ModuleReference(["Foo", "Bar"]))).toBe("Foo/Bar.sam");
  });
});
