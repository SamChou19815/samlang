import {
  Location,
  ModuleReference,
  ModuleReferenceCollections,
  Position,
} from "../../ast/common-nodes";
import { createGlobalErrorCollector } from "../../errors";
import { parseSamlangModuleFromText } from "../../parser";
import prettyPrintSamlangModule from "../../printer";
import { checkNotNull } from "../../utils";
import {
  applyRenamingWithDefinitionAndUse,
  ModuleScopedVariableDefinitionLookup,
  VariableDefinitionLookup,
} from "../variable-definition-service";

function prepareLookup(source: string): ModuleScopedVariableDefinitionLookup {
  const moduleReference = ModuleReference.DUMMY;
  const errorCollector = createGlobalErrorCollector();
  const parsedModule = parseSamlangModuleFromText(
    source,
    moduleReference,
    errorCollector.getErrorReporter(),
  );
  expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  return new ModuleScopedVariableDefinitionLookup(parsedModule);
}

function query(lookup: ModuleScopedVariableDefinitionLookup, location: Location) {
  const defAndUse = lookup.findAllDefinitionAndUses(location);
  if (defAndUse == null) return null;
  const { definitionLocation, useLocations } = defAndUse;
  const locToString = (l: Location) => {
    const s = l.toString();
    return s.substring(s.indexOf(":") + 1);
  };
  return {
    definition: locToString(definitionLocation),
    uses: useLocations.map(locToString),
  };
}

describe("variable-definition-service", () => {
  it("ModuleScopedVariableDefinitionLookup basic test", () => {
    const source = `
class Main {
  function test(a: int, b: bool): unit = { }
}
`;
    expect(prepareLookup(source).findAllDefinitionAndUses(Location.DUMMY)).toBeNull();
  });

  it("ModuleScopedVariableDefinitionLookup look up tests", () => {
    const source = `
class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val g = 3;
    val {f, g as h} = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(f) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`;
    const lookup = prepareLookup(source);

    expect(
      query(lookup, new Location(ModuleReference.DUMMY, Position(3, 12), Position(3, 13))),
    ).toEqual({
      definition: "3:17-3:18",
      uses: ["4:13-4:14"],
    });
    expect(
      query(lookup, new Location(ModuleReference.DUMMY, Position(3, 8), Position(3, 9))),
    ).toEqual({
      definition: "4:9-4:10",
      uses: [],
    });
    expect(
      query(lookup, new Location(ModuleReference.DUMMY, Position(7, 12), Position(7, 13))),
    ).toEqual({
      definition: "6:10-6:11",
      uses: ["8:13-8:14", "9:59-9:60"],
    });
    expect(
      query(lookup, new Location(ModuleReference.DUMMY, Position(7, 16), Position(7, 17))),
    ).toEqual({
      definition: "6:18-6:19",
      uses: ["7:24-7:25", "8:17-8:18", "9:45-9:46", "9:75-9:76", "10:24-10:25"],
    });
    expect(
      query(lookup, new Location(ModuleReference.DUMMY, Position(8, 22), Position(8, 23))),
    ).toEqual({
      definition: "9:23-9:24",
      uses: ["9:37-9:38"],
    });
    expect(
      query(lookup, new Location(ModuleReference.DUMMY, Position(11, 19), Position(11, 21))),
    ).toEqual({
      definition: "12:14-12:16",
      uses: ["12:20-12:22"],
    });
  });

  it("VariableDefinitionLookup and applyRenamingWithDefinitionAndUse integration test 1", () => {
    const moduleReference = ModuleReference(["Test"]);
    const errorCollector = createGlobalErrorCollector();
    const parsedModule = parseSamlangModuleFromText(
      `
class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val g = 3;
    val {f, g as h} = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(f) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
      moduleReference,
      errorCollector.getErrorReporter(),
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
    const lookup = new VariableDefinitionLookup();
    lookup.rebuild(ModuleReferenceCollections.hashMapOf([moduleReference, parsedModule]));

    expect(
      lookup.findAllDefinitionAndUses(
        new Location(ModuleReference(["Test1"]), Location.DUMMY.start, Location.DUMMY.end),
      ),
    ).toBeNull();
    expect(
      lookup.findAllDefinitionAndUses(
        new Location(ModuleReference(["Test"]), Location.DUMMY.start, Location.DUMMY.end),
      ),
    ).toBeNull();

    const assertCorrectlyRewritten = (location: Location, expected: string) =>
      expect(
        prettyPrintSamlangModule(
          60,
          applyRenamingWithDefinitionAndUse(
            parsedModule,
            checkNotNull(lookup.findAllDefinitionAndUses(location)),
            "renAmeD",
          ),
        ),
      ).toBe(expected);

    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(3, 12), Position(3, 13)),
      `class Main {
  function test(renAmeD: int, b: bool): unit = {
    val c = renAmeD;
    val g = 3;
    val { f, g as h } = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(
      f
    ) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
    );
    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(3, 8), Position(3, 9)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val renAmeD = a;
    val g = 3;
    val { f, g as h } = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(
      f
    ) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
    );
    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(5, 35), Position(5, 36)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val renAmeD = 3;
    val { f, g as h } = Main.init(3, renAmeD);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(
      f
    ) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
    );
    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(7, 12), Position(7, 13)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val g = 3;
    val { f as renAmeD, g as h } = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = renAmeD + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(
      renAmeD
    ) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
    );
    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(7, 16), Position(7, 17)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val g = 3;
    val { f, g as renAmeD } = Main.init(3, g);
    val _ = Obj.Tagged(renAmeD);
    val _ = f + renAmeD;
    val lambda1 = (x, y) -> if (
      x + y * 3 > renAmeD
    ) then panic(f) else println(renAmeD);
    match (lambda1(3, !renAmeD)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
    );
    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(8, 22), Position(8, 23)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val g = 3;
    val { f, g as h } = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, renAmeD) -> if (
      x + renAmeD * 3 > h
    ) then panic(f) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`,
    );
    assertCorrectlyRewritten(
      new Location(ModuleReference(["Test"]), Position(11, 19), Position(11, 21)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val g = 3;
    val { f, g as h } = Main.init(3, g);
    val _ = Obj.Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(
      f
    ) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some renAmeD -> renAmeD
    }
  }
}
`,
    );
  });

  it("VariableDefinitionLookup and applyRenamingWithDefinitionAndUse integration test 2", () => {
    const moduleReference = ModuleReference(["Test"]);
    const errorCollector = createGlobalErrorCollector();
    const parsedModule = parseSamlangModuleFromText(
      `
class Main {
  function test(a: int, b: bool): unit = {
    val c = a.foo;
  }
}
`,
      moduleReference,
      errorCollector.getErrorReporter(),
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
    const lookup = new VariableDefinitionLookup();
    lookup.rebuild(ModuleReferenceCollections.hashMapOf([moduleReference, parsedModule]));

    expect(
      prettyPrintSamlangModule(
        60,
        applyRenamingWithDefinitionAndUse(
          parsedModule,
          checkNotNull(
            lookup.findAllDefinitionAndUses(
              new Location(ModuleReference(["Test"]), Position(3, 12), Position(3, 13)),
            ),
          ),
          "renAmeD",
        ),
      ),
    ).toBe(`class Main {
  function test(renAmeD: int, b: bool): unit = {
    val c = renAmeD.foo;
  }
}
`);
  });
});
