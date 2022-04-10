import { Location, ModuleReference, Position } from '../../ast/common-nodes';
import createSamlangLanguageService, { LanguageServiceStateImpl } from '../api';

class InsertTextFormats {
  static readonly PlainText = 1 as const;
  static readonly Snippet = 2 as const;
}

class CompletionItemKinds {
  static readonly METHOD = 2 as const;
  static readonly FUNCTION = 3 as const;
  static readonly FIELD = 5 as const;
}

describe('language-service', () => {
  it('Language server state can update.', () => {
    const state = new LanguageServiceStateImpl([]);
    state.update(
      ModuleReference(['test']),
      `
class Test {
  function test(): int = "haha"
}
interface I { function test(): int }
`
    );

    expect(state.allModulesWithError.length).toBe(1);
    expect(state.getErrors(ModuleReference(['test-test']))).toEqual([]);
    expect(state.getErrors(ModuleReference(['test'])).map((it) => it.toString())).toEqual([
      'test.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    expect(state.globalTypingContext.size).toBe(2);
    expect(state.expressionLocationLookup).toBeTruthy();
    expect(state.classLocationLookup).toBeTruthy();
    expect(state.classMemberLocationLookup).toBeTruthy();
    expect(state.getCheckedModule(ModuleReference(['test']))).toBeTruthy();
    expect(state.getCheckedModule(ModuleReference(['test2']))).toBeUndefined();

    state.remove(ModuleReference(['test']));
    expect(state.allModulesWithError.length).toBe(0);
    expect(state.getErrors(ModuleReference(['test']))).toEqual([]);
  });

  it('Language server state can handle complex dependency patterns', () => {
    const test1ModuleReference = ModuleReference(['Test1']);
    const test2ModuleReference = ModuleReference(['Test2']);
    const state = new LanguageServiceStateImpl([
      [
        test1ModuleReference,
        `
class Test1 {
  function test(): int = "haha"
}
`,
      ],
      [
        test2ModuleReference,
        `
import { Test1, Test2 } from Test1

class Test2 {
  function test(): string = 3
}
`,
      ],
    ]);

    expect(state.getErrors(test1ModuleReference).map((it) => it.toString())).toEqual([
      'Test1.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    expect(state.getErrors(test2ModuleReference).map((it) => it.toString())).toEqual([
      'Test2.sam:2:17-2:22: [UnresolvedName]: Name `Test2` is not resolved.',
      'Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.',
      'Test2.sam:5:29-5:30: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);

    // Adding Test2 can clear one error of its reverse dependency.
    state.update(
      test1ModuleReference,
      `
class Test1 {
  function test(): int = "haha"
}
class Test2 {}
`
    );
    expect(state.getErrors(test1ModuleReference).map((it) => it.toString())).toEqual([
      'Test1.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    expect(state.getErrors(test2ModuleReference).map((it) => it.toString())).toEqual([
      'Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.',
      'Test2.sam:5:29-5:30: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);

    // Clearing local error of Test1
    state.update(
      test1ModuleReference,
      `
class Test1 {
  function test(): int = 3
}
`
    );
    expect(state.getErrors(test1ModuleReference)).toEqual([]);
    expect(state.getErrors(test2ModuleReference).map((it) => it.toString())).toEqual([
      'Test2.sam:2:17-2:22: [UnresolvedName]: Name `Test2` is not resolved.',
      'Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.',
      'Test2.sam:5:29-5:30: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);

    // Clearing local error of Test2
    state.update(
      test2ModuleReference,
      `
import { Test1, Test2 } from Test1

class Test2 {
  function test(): string = "haha"
}
`
    );
    expect(state.getErrors(test1ModuleReference)).toEqual([]);
    expect(state.getErrors(test2ModuleReference).map((it) => it.toString())).toEqual([
      'Test2.sam:2:17-2:22: [UnresolvedName]: Name `Test2` is not resolved.',
      'Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.',
    ]);

    // Clearing all errors of Test2
    state.update(
      test2ModuleReference,
      `
import { Test1 } from Test1

class Test2 {
  function test(): string = "haha"
}
  `
    );
    expect(state.getErrors(test1ModuleReference)).toEqual([]);
    expect(state.getErrors(test2ModuleReference)).toEqual([]);
  });

  it('LanguageServices type query test 1', () => {
    const testModuleReference = ModuleReference(['Test']);
    const test2ModuleReference = ModuleReference(['Test2']);
    const test3ModuleReference = ModuleReference(['Test3']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `/** Test */
class Test1 {
  /** test */
  function test(): int = "haha"

  function test2(): int = Test1.test()
}
`,
      ],
      [
        test2ModuleReference,
        `
class Test1(val a: int) {
  method test(): int = 1

  function test2(): int = Test1.init(3).test()
}
`,
      ],
      [test3ModuleReference, 'class Test1 { function test(): int = NonExisting.test() }'],
    ]);

    expect(service.queryForHover(testModuleReference, Position(100, 100))).toBeNull();
    expect(service.queryForHover(testModuleReference, Position(3, 27))?.contents).toEqual([
      { language: 'samlang', value: 'string' },
    ]);
    expect(service.queryForHover(testModuleReference, Position(1, 9))?.contents).toEqual([
      { language: 'samlang', value: 'class Test1' },
      { language: 'markdown', value: 'Test' },
    ]);
    expect(service.queryForHover(testModuleReference, Position(5, 34))?.contents).toEqual([
      { language: 'samlang', value: '() -> int' },
      { language: 'markdown', value: 'test' },
    ]);
    expect(service.queryForHover(test2ModuleReference, Position(1, 9))?.contents).toEqual([
      { language: 'samlang', value: 'class Test1' },
    ]);
    expect(service.queryForHover(test2ModuleReference, Position(4, 44))?.contents).toEqual([
      { language: 'samlang', value: '() -> int' },
    ]);
    expect(service.queryForHover(test3ModuleReference, Position(0, 45))?.contents).toEqual([
      { language: 'samlang', value: 'class NonExisting' },
    ]);
  });

  it('LanguageServices type query test 2', () => {
    const testModuleReference = ModuleReference(['Test']);
    const test2ModuleReference = ModuleReference(['Test2']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `/** Test */
class Test1 {
  /** test */
  // function test(): int = "haha"

  function test2(): int = Test1.test()
}
`,
      ],
      [
        test2ModuleReference,
        `import {Test1} from Test
class Test2(val a: int) {
  method test(): int = 1

  function test2(): int = Test1.test()
}
`,
      ],
    ]);
    expect(service.queryForHover(test2ModuleReference, Position(4, 36))?.contents).toBeUndefined();
  });

  it('LanguageServices type query test 3', () => {
    const testModuleReference = ModuleReference(['Test']);
    const test2ModuleReference = ModuleReference(['Test2']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `/** Test */
class Test1 {
  /** test */
  // function test(): int = -1

  function test2(): int = Builtins.stringToInt("")
}
`,
      ],
      [
        test2ModuleReference,
        `import {Test1} from Test
class Test2(val a: int) {
  method test(): int = -1

  function test2(): int = Builtins.panic("")
}
`,
      ],
    ]);

    expect(service.queryDefinitionLocation(testModuleReference, Position(4, 33))).toBeNull();
    expect(service.queryDefinitionLocation(test2ModuleReference, Position(2, 23))).toBeNull();
    expect(service.queryDefinitionLocation(test2ModuleReference, Position(4, 30))).toBeNull();
    expect(service.queryDefinitionLocation(test2ModuleReference, Position(4, 33))).toBeNull();
    expect(service.queryDefinitionLocation(test2ModuleReference, Position(4, 37))).toBeNull();
  });

  it('LanguageServices.queryDefinitionLocation test 1', () => {
    const moduleReference1 = ModuleReference(['Test1']);
    const moduleReference2 = ModuleReference(['Test2']);
    const moduleReference3 = ModuleReference(['Test3']);
    const service = createSamlangLanguageService([
      [moduleReference3, 'class ABC { function a(): unit = { val _ = 1; } }'],
      [moduleReference2, 'class TTT { method test(): int = this.test() }'],
      [
        moduleReference1,
        `import {ABC} from Test3
import {TTT} from Test2
class Test1(val a: int) {
  function test1(): int = 42
  function test(t: TTT): int = Test1.test(t) + t.test() + 1
  function test2(): unit = ABC.a()
  function test3(): int = Test1.init(3).a
  function test4(): unit = {
    val _ = {
      val b = 3;
      val _ = b + 2;
      val _ = c;
    }
  }
}
`,
      ],
    ]);

    expect(service.state.allModulesWithError.map((it) => it.toString())).toEqual(['Test1']);

    expect(service.queryDefinitionLocation(moduleReference1, Position(100, 100))).toBeNull();
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 46))).toBeNull();
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 59))).toBeNull();
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 60))).toBeNull();

    const actualLocation0 = service.queryDefinitionLocation(moduleReference1, Position(4, 34));
    expect(actualLocation0?.toString()).toEqual(
      new Location(moduleReference1, Position(2, 0), Position(14, 1)).toString()
    );

    const actualLocation1 = service.queryDefinitionLocation(moduleReference1, Position(4, 40));
    expect(actualLocation1?.toString()).toEqual(
      new Location(moduleReference1, Position(4, 2), Position(4, 59)).toString()
    );

    const actualLocation21 = service.queryDefinitionLocation(moduleReference1, Position(4, 47));
    expect(actualLocation21?.toString()).toEqual(
      new Location(moduleReference1, Position(4, 16), Position(4, 17)).toString()
    );

    const actualLocation22 = service.queryDefinitionLocation(moduleReference1, Position(4, 51));
    expect(actualLocation22?.toString()).toEqual(
      new Location(moduleReference2, Position(0, 12), Position(0, 44)).toString()
    );

    const actualLocation3 = service.queryDefinitionLocation(moduleReference1, Position(5, 30));
    expect(actualLocation3?.toString()).toEqual(
      new Location(moduleReference3, Position(0, 0), Position(0, 49)).toString()
    );

    const actualLocation4 = service.queryDefinitionLocation(moduleReference1, Position(6, 28));
    expect(actualLocation4?.toString()).toEqual(
      new Location(moduleReference1, Position(2, 0), Position(14, 1)).toString()
    );

    expect(service.queryDefinitionLocation(moduleReference1, Position(6, 35))).toBeNull();

    const actualLocation5 = service.queryDefinitionLocation(moduleReference1, Position(6, 41));
    expect(actualLocation5?.toString()).toEqual(
      new Location(moduleReference1, Position(2, 11), Position(2, 23)).toString()
    );

    const actualLocation6 = service.queryDefinitionLocation(moduleReference1, Position(10, 15));
    expect(actualLocation6?.toString()).toEqual(
      new Location(moduleReference1, Position(9, 10), Position(9, 11)).toString()
    );
    const actualLocation7 = service.queryDefinitionLocation(moduleReference1, Position(11, 15));
    expect(actualLocation7).toBeNull();
  });

  it('LanguageServices.queryDefinitionLocation test 2', () => {
    const moduleReference1 = ModuleReference(['Test1']);
    const service = createSamlangLanguageService([
      [
        moduleReference1,
        `class Test1(val a: int) {
  function test(): int = {
    val [c, b] = [1, 2];

    a + b + c
  }
}
`,
      ],
    ]);
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 4))).toBeNull();
  });

  it('LanguageServices.queryFoldingRanges test', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    Cons(Pair.init(t, Nil({})))
  method cons(t: T): List<T> =
    Cons(Pair.init(t, this))
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    Developer.init("Sam Zhou", github, l)
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
      ],
    ]);
    expect(
      service.queryFoldingRanges(testModuleReference)?.map((loc) => loc.toString())
    ).toMatchObject([
      new Location(testModuleReference, Position(1, 0), Position(1, 39)).toString(),
      new Location(testModuleReference, Position(3, 2), Position(4, 31)).toString(),
      new Location(testModuleReference, Position(5, 2), Position(6, 28)).toString(),
      new Location(testModuleReference, Position(2, 0), Position(7, 1)).toString(),
      new Location(testModuleReference, Position(12, 2), Position(16, 3)).toString(),
      new Location(testModuleReference, Position(8, 0), Position(17, 1)).toString(),
      new Location(testModuleReference, Position(19, 2), Position(19, 46)).toString(),
      new Location(testModuleReference, Position(18, 0), Position(20, 1)).toString(),
    ]);
    expect(service.queryFoldingRanges(ModuleReference(['dsafadfasd']))).toBe(null);
  });

  it('LanguageServices autocompletion test 1', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    Cons(Pair.init(t, Nil({})))
  method cons(t: T): List<T> =
    Cons(Pair.init(t, this))
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    Developer.init("Sam Zhou", github, l).
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
      ],
    ]);
    expect(service.autoComplete(testModuleReference, Position(4, 5))).toEqual([]);
    expect(service.autoComplete(testModuleReference, Position(13, 17))).toEqual([
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        label: 'of(a0: _T0): List<_T0>',
        insertText: 'of($0)$1',
        detail: '<_T0>((_T0) -> List<_T0>)',
      },
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        detail: '<_T0>((unit) -> List<_T0>)',
        insertText: 'Nil($0)$1',
        label: 'Nil(a0: unit): List<_T0>',
      },
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        detail: '<_T0>((Pair<_T0, List<_T0>>) -> List<_T0>)',
        insertText: 'Cons($0)$1',
        label: 'Cons(a0: Pair<_T0, List<_T0>>): List<_T0>',
      },
    ]);
    expect(service.autoComplete(testModuleReference, Position(13, 31))).toEqual([
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.METHOD,
        label: 'cons(a0: T): List<T>',
        insertText: 'cons($0)$1',
        detail: '(T) -> List<T>',
      },
    ]);
    expect(service.autoComplete(testModuleReference, Position(15, 46))).toEqual([
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FIELD,
        label: 'name',
        insertText: 'name',
        detail: 'string',
      },
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FIELD,
        label: 'github',
        insertText: 'github',
        detail: 'string',
      },
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FIELD,
        label: 'projects',
        insertText: 'projects',
        detail: 'List<string>',
      },
    ]);
    expect(service.autoComplete(testModuleReference, Position(19, 41))).toEqual([
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FUNCTION,
        label: 'sam(): Developer',
        insertText: 'sam()',
        detail: '() -> Developer',
      },
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        detail: '(string, string, List<string>) -> Developer',
        insertText: 'init($0, $1, $2)$3',
        label: 'init(a0: string, a1: string, a2: List<string>): Developer',
      },
    ]);
  });

  it('LanguageServices autocompletion test 2', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    Cons(Pair.init(t, Nil({})))
  method cons(t: T): List<T> =
    Cons(Pair.init(t, this))
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    Developer.init("Sam Zhou", github, l).
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
      ],
    ]);

    expect(service.autoComplete(testModuleReference, Position(15, 43))).toEqual([
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FIELD,
        label: 'name',
        insertText: 'name',
        detail: 'string',
      },
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FIELD,
        label: 'github',
        insertText: 'github',
        detail: 'string',
      },
      {
        insertTextFormat: InsertTextFormats.PlainText,
        kind: CompletionItemKinds.FIELD,
        label: 'projects',
        insertText: 'projects',
        detail: 'List<string>',
      },
    ]);
  });

  it('LanguageServices autocompletion test 3', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([[testModuleReference, '.']]);
    expect(service.autoComplete(testModuleReference, Position(0, 1))).toEqual([]);
  });

  it('LanguageServices autocompletion test 4', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Main {
  function main(): Developer = Developer.
}
  `,
      ],
    ]);
    expect(service.autoComplete(testModuleReference, Position(2, 41))).toEqual([]);
  });

  it('LanguageServices autocompletion test 5', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Main {
  function main(a: Developer): Developer = a.
}
  `,
      ],
    ]);
    expect(service.autoComplete(testModuleReference, Position(2, 45))).toEqual([]);
  });

  it('LanguageServices rename bad identifier tests', () => {
    const service = createSamlangLanguageService([]);
    const testModuleReference = ModuleReference(['Test']);
    expect(service.renameVariable(testModuleReference, Position(2, 45), '3')).toBe('Invalid');
    expect(service.renameVariable(testModuleReference, Position(2, 45), 'A3')).toBe('Invalid');
    expect(service.renameVariable(testModuleReference, Position(2, 45), 'a3')).toBeNull();
  });

  it('LanguageServices rename not-found tests', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `/** Test */
class Test1 {
  /** test */
  function test(): int = "haha"

  function test2(): int = Test1.test()
}
`,
      ],
    ]);
    expect(service.renameVariable(testModuleReference, Position(100, 100), 'a')).toBeNull();
    expect(service.renameVariable(testModuleReference, Position(3, 27), 'a')).toBeNull();
    expect(service.renameVariable(testModuleReference, Position(1, 9), 'a')).toBeNull();
  });

  it('LanguageServices failed to rename due to undefined variable tests', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Test {
  function main(): unit = { val a = b; }
}
`,
      ],
    ]);
    expect(service.renameVariable(testModuleReference, Position(2, 36), 'a')).toBeNull();
    expect(service.renameVariable(testModuleReference, Position(2, 32), 'a')).toBe(
      `class Test {
  function main(): unit = {
    val a = b;
  }
}\n`
    );
    expect(service.renameVariable(testModuleReference, Position(2, 32), 'c')).toBe(
      `class Test {
  function main(): unit = {
    val c = b;
  }
}\n`
    );
  });

  it('LanguageServices format test with good programs', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Main {
  function main(): Developer = Developer.sam()
}
`,
      ],
    ]);
    expect(service.formatEntireDocument(testModuleReference)).toBe(
      `class Main {
  function main(): Developer = Developer.sam()
}
`
    );
    expect(service.formatEntireDocument(ModuleReference(['dsafadfasd']))).toBe(null);
  });

  it('LanguageServices format test with bad programs', () => {
    const testModuleReference = ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    { name: projects:  }.
  }
}
`,
      ],
    ]);
    expect(service.formatEntireDocument(testModuleReference)).toBe(null);
  });
});
