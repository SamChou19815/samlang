import { ModuleReference, Position, Range } from 'samlang-core-ast/common-nodes';
import { createGlobalErrorCollector } from 'samlang-core-errors';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import prettyPrintSamlangModule from 'samlang-core-printer';
import { checkNotNull, hashMapOf } from 'samlang-core-utils';

import {
  ModuleScopedVariableDefinitionLookup,
  VariableDefinitionLookup,
  applyRenamingWithDefinitionAndUse,
} from '../variable-definition-service';

function prepareLookup(source: string): ModuleScopedVariableDefinitionLookup {
  const moduleReference = ModuleReference.DUMMY;
  const errorCollector = createGlobalErrorCollector();
  const parsedModule = parseSamlangModuleFromText(
    source,
    moduleReference,
    new Set(),
    errorCollector.getModuleErrorCollector(moduleReference)
  );
  expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  return new ModuleScopedVariableDefinitionLookup(parsedModule);
}

function query(lookup: ModuleScopedVariableDefinitionLookup, range: Range) {
  const defAndUse = lookup.findAllDefinitionAndUses(range);
  if (defAndUse == null) return null;
  const { definitionRange, useRanges } = defAndUse;
  return { definition: definitionRange.toString(), uses: useRanges.map((it) => it.toString()) };
}

describe('variable-definition-service', () => {
  it('ModuleScopedVariableDefinitionLookup basic test', () => {
    const source = `
class Main {
  function test(a: int, b: bool): unit = { }
}
`;
    expect(prepareLookup(source).findAllDefinitionAndUses(Range.DUMMY)).toBeNull();
  });

  it('ModuleScopedVariableDefinitionLookup look up tests', () => {
    const source = `
class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val {f, g as h} = {f:3, g};
    val _ = Tagged(h);
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

    expect(query(lookup, new Range(new Position(3, 12), new Position(3, 13)))).toEqual({
      definition: '3:17-3:18',
      uses: ['4:13-4:14'],
    });
    expect(query(lookup, new Range(new Position(3, 8), new Position(3, 9)))).toEqual({
      definition: '4:9-4:10',
      uses: [],
    });
    expect(query(lookup, new Range(new Position(4, 9), new Position(4, 10)))).toEqual({
      definition: '5:10-5:11',
      uses: [],
    });
    expect(query(lookup, new Range(new Position(8, 12), new Position(8, 13)))).toEqual({
      definition: '7:10-7:11',
      uses: ['9:13-9:14', '10:59-10:60'],
    });
    expect(query(lookup, new Range(new Position(8, 16), new Position(8, 17)))).toEqual({
      definition: '7:18-7:19',
      uses: ['8:20-8:21', '9:17-9:18', '10:45-10:46', '10:75-10:76', '11:24-11:25'],
    });
    expect(query(lookup, new Range(new Position(9, 22), new Position(9, 23)))).toEqual({
      definition: '10:23-10:24',
      uses: ['10:37-10:38'],
    });
    expect(query(lookup, new Range(new Position(12, 19), new Position(12, 21)))).toEqual({
      definition: '13:14-13:16',
      uses: ['13:20-13:22'],
    });
  });

  it('VariableDefinitionLookup and applyRenamingWithDefinitionAndUse integration test 1', () => {
    const moduleReference = new ModuleReference(['Test']);
    const errorCollector = createGlobalErrorCollector();
    const parsedModule = parseSamlangModuleFromText(
      `
class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val {f, g as h} = {f:3, g};
    val _ = Tagged(h);
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
      new Set(),
      errorCollector.getModuleErrorCollector(moduleReference)
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
    const lookup = new VariableDefinitionLookup();
    lookup.rebuild(hashMapOf([moduleReference, parsedModule]));

    expect(lookup.findAllDefinitionAndUses(new ModuleReference(['Test1']), Range.DUMMY)).toBeNull();
    expect(lookup.findAllDefinitionAndUses(new ModuleReference(['Test']), Range.DUMMY)).toBeNull();

    const assertCorrectlyRewritten = (range: Range, expected: string) =>
      expect(
        prettyPrintSamlangModule(
          60,
          applyRenamingWithDefinitionAndUse(
            parsedModule,
            checkNotNull(lookup.findAllDefinitionAndUses(new ModuleReference(['Test']), range)),
            'renAmeD'
          )
        )
      ).toBe(expected);

    assertCorrectlyRewritten(
      new Range(new Position(3, 12), new Position(3, 13)),
      `class Main {
  function test(renAmeD: int, b: bool): unit = {
    val c = renAmeD;
    val [e, _] = [b, 2];
    val g = 3;
    val { f, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(3, 8), new Position(3, 9)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val renAmeD = a;
    val [e, _] = [b, 2];
    val g = 3;
    val { f, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(4, 9), new Position(4, 10)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [renAmeD, _] = [b, 2];
    val g = 3;
    val { f, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(4, 18), new Position(4, 19)),
      `class Main {
  function test(a: int, renAmeD: bool): unit = {
    val c = a;
    val [e, _] = [renAmeD, 2];
    val g = 3;
    val { f, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(6, 28), new Position(6, 29)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val renAmeD = 3;
    val { f, g as h } = { f: 3, g: renAmeD };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(8, 12), new Position(8, 13)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val { f as renAmeD, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(8, 16), new Position(8, 17)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val { f, g as renAmeD } = { f: 3, g };
    val _ = Tagged(renAmeD);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(9, 22), new Position(9, 23)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val { f, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
    assertCorrectlyRewritten(
      new Range(new Position(12, 19), new Position(12, 21)),
      `class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val { f, g as h } = { f: 3, g };
    val _ = Tagged(h);
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
`
    );
  });

  it('VariableDefinitionLookup and applyRenamingWithDefinitionAndUse integration test 2', () => {
    const moduleReference = new ModuleReference(['Test']);
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
      new Set(),
      errorCollector.getModuleErrorCollector(moduleReference)
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
    const lookup = new VariableDefinitionLookup();
    lookup.rebuild(hashMapOf([moduleReference, parsedModule]));

    expect(
      prettyPrintSamlangModule(
        60,
        applyRenamingWithDefinitionAndUse(
          parsedModule,
          checkNotNull(
            lookup.findAllDefinitionAndUses(
              new ModuleReference(['Test']),
              new Range(new Position(3, 12), new Position(3, 13))
            )
          ),
          'renAmeD'
        )
      )
    ).toBe(`class Main {
  function test(renAmeD: int, b: bool): unit = {
    val c = renAmeD.foo;
  }

}
`);
  });
});
