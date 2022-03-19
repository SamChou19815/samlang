import { ModuleReference, Position, Range } from '../../ast/common-nodes';
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
      new ModuleReference(['test']),
      `
class Test {
  function test(): int = "haha"
}
`
    );

    expect(state.allModulesWithError.length).toBe(1);
    expect(state.getErrors(new ModuleReference(['test-test']))).toEqual([]);
    expect(state.getErrors(new ModuleReference(['test'])).map((it) => it.toString())).toEqual([
      'test.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    expect(state.globalTypingContext.size).toBe(2);
    expect(state.expressionLocationLookup).toBeTruthy();
    expect(state.classLocationLookup).toBeTruthy();
    expect(state.classMemberLocationLookup).toBeTruthy();
    expect(state.getCheckedModule(new ModuleReference(['test']))).toBeTruthy();
    expect(state.getCheckedModule(new ModuleReference(['test2']))).toBeUndefined();

    state.remove(new ModuleReference(['test']));
    expect(state.allModulesWithError.length).toBe(0);
    expect(state.getErrors(new ModuleReference(['test']))).toEqual([]);
  });

  it('Language server state can handle complex dependency patterns', () => {
    const test1ModuleReference = new ModuleReference(['Test1']);
    const test2ModuleReference = new ModuleReference(['Test2']);
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
    const testModuleReference = new ModuleReference(['Test']);
    const test2ModuleReference = new ModuleReference(['Test2']);
    const test3ModuleReference = new ModuleReference(['Test3']);
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
    const testModuleReference = new ModuleReference(['Test']);
    const test2ModuleReference = new ModuleReference(['Test2']);
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
    const testModuleReference = new ModuleReference(['Test']);
    const test2ModuleReference = new ModuleReference(['Test2']);
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
    const moduleReference1 = new ModuleReference(['Test1']);
    const moduleReference2 = new ModuleReference(['Test2']);
    const moduleReference3 = new ModuleReference(['Test3']);
    const service = createSamlangLanguageService([
      [moduleReference3, 'class ABC { function a(): unit = { val _ = [1,2]; } }'],
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
    }
  }
}
`,
      ],
    ]);

    expect(service.state.allModulesWithError.map((it) => it.toString())).toEqual([]);

    expect(service.queryDefinitionLocation(moduleReference1, Position(100, 100))).toBeNull();
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 46))).toBeNull();
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 59))).toBeNull();
    expect(service.queryDefinitionLocation(moduleReference1, Position(4, 60))).toBeNull();

    const actualLocation0 = service.queryDefinitionLocation(moduleReference1, Position(4, 34));
    expect(actualLocation0?.moduleReference.toString()).toEqual(moduleReference1.toString());
    expect(actualLocation0?.range.toString()).toEqual(
      new Range(Position(2, 0), Position(13, 1)).toString()
    );

    const actualLocation1 = service.queryDefinitionLocation(moduleReference1, Position(4, 40));
    expect(actualLocation1?.moduleReference.toString()).toEqual(moduleReference1.toString());
    expect(actualLocation1?.range.toString()).toEqual(
      new Range(Position(4, 2), Position(4, 59)).toString()
    );

    const actualLocation21 = service.queryDefinitionLocation(moduleReference1, Position(4, 47));
    expect(actualLocation21?.moduleReference.toString()).toEqual(moduleReference1.toString());
    expect(actualLocation21?.range.toString()).toEqual(
      new Range(Position(4, 16), Position(4, 17)).toString()
    );

    const actualLocation22 = service.queryDefinitionLocation(moduleReference1, Position(4, 51));
    expect(actualLocation22?.moduleReference.toString()).toEqual(moduleReference2.toString());
    expect(actualLocation22?.range.toString()).toEqual(
      new Range(Position(0, 12), Position(0, 44)).toString()
    );

    const actualLocation3 = service.queryDefinitionLocation(moduleReference1, Position(5, 30));
    expect(actualLocation3?.moduleReference.toString()).toEqual(moduleReference3.toString());
    expect(actualLocation3?.range.toString()).toEqual(
      new Range(Position(0, 0), Position(0, 53)).toString()
    );

    const actualLocation4 = service.queryDefinitionLocation(moduleReference1, Position(6, 28));
    expect(actualLocation4?.moduleReference.toString()).toEqual(moduleReference1.toString());
    expect(actualLocation4?.range.toString()).toEqual(
      new Range(Position(2, 0), Position(13, 1)).toString()
    );

    expect(service.queryDefinitionLocation(moduleReference1, Position(6, 35))).toBeNull();

    const actualLocation5 = service.queryDefinitionLocation(moduleReference1, Position(6, 41));
    expect(actualLocation5?.moduleReference.toString()).toEqual(moduleReference1.toString());
    expect(actualLocation5?.range.toString()).toEqual(
      new Range(Position(2, 11), Position(2, 23)).toString()
    );

    const actualLocation6 = service.queryDefinitionLocation(moduleReference1, Position(10, 15));
    expect(actualLocation6?.moduleReference.toString()).toEqual(moduleReference1.toString());
    expect(actualLocation6?.range.toString()).toEqual(
      new Range(Position(9, 10), Position(9, 11)).toString()
    );
  });

  it('LanguageServices.queryDefinitionLocation test 2', () => {
    const moduleReference1 = new ModuleReference(['Test1']);
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
    const testModuleReference = new ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class List<T>(Nil(unit), Cons([T * List<T>])) {
  function <T> of(t: T): List<T> =
    Cons([t, Nil({})])
  method cons(t: T): List<T> =
    Cons([t, this])
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
      service.queryFoldingRanges(testModuleReference)?.map((module) => module.toString())
    ).toMatchObject([
      new Range(Position(2, 2), Position(3, 22)).toString(),
      new Range(Position(4, 2), Position(5, 19)).toString(),
      new Range(Position(1, 0), Position(6, 1)).toString(),
      new Range(Position(11, 2), Position(15, 3)).toString(),
      new Range(Position(7, 0), Position(16, 1)).toString(),
      new Range(Position(18, 2), Position(18, 46)).toString(),
      new Range(Position(17, 0), Position(19, 1)).toString(),
    ]);
    expect(service.queryFoldingRanges(new ModuleReference(['dsafadfasd']))).toBe(null);
  });

  it('LanguageServices autocompletion test 1', () => {
    const testModuleReference = new ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class List<T>(Nil(unit), Cons([T * List<T>])) {
  function <T> of(t: T): List<T> =
    Cons([t, Nil({})])
  method cons(t: T): List<T> =
    Cons([t, this])
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
    expect(service.autoComplete(testModuleReference, Position(3, 5))).toEqual([]);
    expect(service.autoComplete(testModuleReference, Position(12, 17))).toEqual([
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        label: 'of(a0: T): List<T>',
        insertText: 'of($0)$1',
        detail: '<T>((T) -> List<T>)',
      },
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        detail: '<T>((unit) -> List<T>)',
        insertText: 'Nil($0)$1',
        label: 'Nil(a0: unit): List<T>',
      },
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.FUNCTION,
        detail: '<T>(([T * List<T>]) -> List<T>)',
        insertText: 'Cons($0)$1',
        label: 'Cons(a0: [T * List<T>]): List<T>',
      },
    ]);
    expect(service.autoComplete(testModuleReference, Position(12, 31))).toEqual([
      {
        insertTextFormat: InsertTextFormats.Snippet,
        kind: CompletionItemKinds.METHOD,
        label: 'cons(a0: T): List<T>',
        insertText: 'cons($0)$1',
        detail: '(T) -> List<T>',
      },
    ]);
    expect(service.autoComplete(testModuleReference, Position(14, 46))).toEqual([
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
    expect(service.autoComplete(testModuleReference, Position(18, 41))).toEqual([
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
    const testModuleReference = new ModuleReference(['Test']);
    const service = createSamlangLanguageService([
      [
        testModuleReference,
        `
class List<T>(Nil(unit), Cons([T * List<T>])) {
  function <T> of(t: T): List<T> =
    Cons([t, Nil({})])
  method cons(t: T): List<T> =
    Cons([t, this])
  private test(): unit = {}
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    { name: "Sam Zhou", github, projects: l }.
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
      ],
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
  });

  it('LanguageServices autocompletion test 3', () => {
    const testModuleReference = new ModuleReference(['Test']);
    const service = createSamlangLanguageService([[testModuleReference, '.']]);
    expect(service.autoComplete(testModuleReference, Position(0, 1))).toEqual([]);
  });

  it('LanguageServices autocompletion test 4', () => {
    const testModuleReference = new ModuleReference(['Test']);
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
    const testModuleReference = new ModuleReference(['Test']);
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
    const testModuleReference = new ModuleReference(['Test']);
    expect(service.renameVariable(testModuleReference, Position(2, 45), '3')).toBe('Invalid');
    expect(service.renameVariable(testModuleReference, Position(2, 45), 'A3')).toBe('Invalid');
    expect(service.renameVariable(testModuleReference, Position(2, 45), 'a3')).toBeNull();
  });

  it('LanguageServices rename not-found tests', () => {
    const testModuleReference = new ModuleReference(['Test']);
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
    const testModuleReference = new ModuleReference(['Test']);
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
    const testModuleReference = new ModuleReference(['Test']);
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
    expect(service.formatEntireDocument(new ModuleReference(['dsafadfasd']))).toBe(null);
  });

  it('LanguageServices format test with bad programs', () => {
    const testModuleReference = new ModuleReference(['Test']);
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
