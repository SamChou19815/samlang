import { LanguageServiceState, LanguageServices, CompletionItemKinds } from '../language-service';

import { stringType, Position, Range, ModuleReference } from 'samlang-core-ast/common-nodes';

it('Language server state can update.', () => {
  const state = new LanguageServiceState([]);
  state.update(
    new ModuleReference(['test']),
    `
class Test {
  function test(): int = "haha"
}
`
  );

  expect(state.allErrors.length).toBe(1);
  expect(state.getErrors(new ModuleReference(['test-test']))).toEqual([]);
  expect(state.getErrors(new ModuleReference(['test'])).map((it) => it.toString())).toEqual([
    'test.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`.',
  ]);
  expect(state.globalTypingContext.size).toBe(1);
  expect(state.expressionLocationLookup).toBeTruthy();
  expect(state.classLocationLookup).toBeTruthy();
  expect(state.classMemberLocationLookup).toBeTruthy();
  expect(state.getCheckedModule(new ModuleReference(['test']))).toBeTruthy();
  expect(state.getCheckedModule(new ModuleReference(['test2']))).toBeUndefined();

  state.remove(new ModuleReference(['test']));
  expect(state.allErrors.length).toBe(0);
  expect(state.allModulesWithError.length).toBe(0);
  expect(state.getErrors(new ModuleReference(['test']))).toEqual([]);
});

it('Language server state can handle complex dependency patterns', () => {
  const test1ModuleReference = new ModuleReference(['Test1']);
  const test2ModuleReference = new ModuleReference(['Test2']);
  const state = new LanguageServiceState([
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

it('LanguageServices type query test', () => {
  const testModuleReference = new ModuleReference(['Test']);
  const state = new LanguageServiceState([
    [
      testModuleReference,
      `
class Test1 {
  function test(): int = "haha"
}
`,
    ],
  ]);
  const service = new LanguageServices(state, () => '');

  expect(service.queryType(testModuleReference, new Position(100, 100))).toBeNull();
  expect(service.queryType(testModuleReference, new Position(2, 27))?.[0]).toEqual(stringType);
});

it('LanguageServices.queryDefinitionLocation test', () => {
  const moduleReference1 = new ModuleReference(['Test1']);
  const moduleReference2 = new ModuleReference(['Test2']);
  const moduleReference3 = new ModuleReference(['Test3']);
  const state = new LanguageServiceState([
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
  function test3(): int = { a: 3 }.a
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
  const service = new LanguageServices(state, () => '');

  expect(state.allErrors.map((it) => it.toString())).toEqual([]);

  expect(service.queryDefinitionLocation(moduleReference1, new Position(100, 100))).toBeNull();
  expect(service.queryDefinitionLocation(moduleReference1, new Position(4, 46))).toBeNull();
  expect(service.queryDefinitionLocation(moduleReference1, new Position(4, 47))).toBeNull();
  expect(service.queryDefinitionLocation(moduleReference1, new Position(4, 48))).toBeNull();
  expect(service.queryDefinitionLocation(moduleReference1, new Position(4, 59))).toBeNull();
  expect(service.queryDefinitionLocation(moduleReference1, new Position(4, 60))).toBeNull();

  const actualLocation0 = service.queryDefinitionLocation(moduleReference1, new Position(4, 34));
  expect(actualLocation0?.moduleReference.toString()).toEqual(moduleReference1.toString());
  expect(actualLocation0?.range.toString()).toEqual(
    new Range(new Position(2, 0), new Position(13, 1)).toString()
  );

  const actualLocation1 = service.queryDefinitionLocation(moduleReference1, new Position(4, 40));
  expect(actualLocation1?.moduleReference.toString()).toEqual(moduleReference1.toString());
  expect(actualLocation1?.range.toString()).toEqual(
    new Range(new Position(4, 2), new Position(4, 59)).toString()
  );

  const actualLocation2 = service.queryDefinitionLocation(moduleReference1, new Position(4, 51));
  expect(actualLocation2?.moduleReference.toString()).toEqual(moduleReference2.toString());
  expect(actualLocation2?.range.toString()).toEqual(
    new Range(new Position(0, 12), new Position(0, 44)).toString()
  );

  const actualLocation3 = service.queryDefinitionLocation(moduleReference1, new Position(5, 30));
  expect(actualLocation3?.moduleReference.toString()).toEqual(moduleReference3.toString());
  expect(actualLocation3?.range.toString()).toEqual(
    new Range(new Position(0, 0), new Position(0, 53)).toString()
  );

  const actualLocation4 = service.queryDefinitionLocation(moduleReference1, new Position(6, 28));
  expect(actualLocation4?.moduleReference.toString()).toEqual(moduleReference1.toString());
  expect(actualLocation4?.range.toString()).toEqual(
    new Range(new Position(2, 12), new Position(2, 22)).toString()
  );

  const actualLocation5 = service.queryDefinitionLocation(moduleReference1, new Position(6, 36));
  expect(actualLocation5?.moduleReference.toString()).toEqual(moduleReference1.toString());
  expect(actualLocation5?.range.toString()).toEqual(
    new Range(new Position(2, 12), new Position(2, 22)).toString()
  );

  const actualLocation6 = service.queryDefinitionLocation(moduleReference1, new Position(10, 15));
  expect(actualLocation6?.moduleReference.toString()).toEqual(moduleReference1.toString());
  expect(actualLocation6?.range.toString()).toEqual(
    new Range(new Position(9, 6), new Position(9, 16)).toString()
  );
});

it('LanguageServices.queryFoldingRanges test', () => {
  const testModuleReference = new ModuleReference(['Test']);
  const state = new LanguageServiceState([
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
  val projects: List<string>,
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    { name: "Sam Zhou", github, projects: l }.
    function sam(): Developer = {
      val l = List.of("SAMLANG").cons("...")
      val github = "SamChou19815"
      { name: "Sam Zhou", github, projects: l }.
    }
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
    ],
  ]);
  const service = new LanguageServices(state, () => 'foo bar');
  expect(
    service.queryFoldingRanges(testModuleReference)?.map((module) => module.toString())
  ).toMatchObject([
    new Range(new Position(2, 2), new Position(3, 22)).toString(),
    new Range(new Position(4, 2), new Position(5, 19)).toString(),
    new Range(new Position(1, 0), new Position(6, 1)).toString(),
    new Range(new Position(11, 2), new Position(16, 44)).toString(),
    new Range(new Position(7, 0), new Position(18, 47)).toString(),
    new Range(new Position(23, 2), new Position(23, 46)).toString(),
    new Range(new Position(22, 0), new Position(24, 1)).toString(),
  ]);
  expect(service.queryFoldingRanges(new ModuleReference(['dsafadfasd']))).toBe(null);
});

it('LanguageServices autocompletion test', () => {
  const testModuleReference = new ModuleReference(['Test']);
  const state = new LanguageServiceState([
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
  val projects: List<string>,
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
  const service = new LanguageServices(state, () => '');

  expect(service.autoComplete(testModuleReference, new Position(3, 5))).toEqual([]);
  expect(service.autoComplete(testModuleReference, new Position(12, 17))).toEqual([
    {
      isSnippet: true,
      kind: CompletionItemKinds.FUNCTION,
      name: 'of(a0: T): List<T>',
      text: 'of($0)$1',
      type: '<T>((T) -> List<T>)',
    },
  ]);
  expect(service.autoComplete(testModuleReference, new Position(12, 31))).toEqual([
    {
      isSnippet: true,
      kind: CompletionItemKinds.METHOD,
      name: 'cons(a0: T): List<T>',
      text: 'cons($0)$1',
      type: '(T) -> List<T>',
    },
  ]);
  expect(service.autoComplete(testModuleReference, new Position(14, 46))).toEqual([
    {
      isSnippet: false,
      kind: CompletionItemKinds.FIELD,
      name: 'name',
      text: 'name',
      type: 'string',
    },
    {
      isSnippet: false,
      kind: CompletionItemKinds.FIELD,
      name: 'github',
      text: 'github',
      type: 'string',
    },
    {
      isSnippet: false,
      kind: CompletionItemKinds.FIELD,
      name: 'projects',
      text: 'projects',
      type: 'List<string>',
    },
  ]);
});

it('LanguageServices format test with good programs', () => {
  const testModuleReference = new ModuleReference(['Test']);
  const state = new LanguageServiceState([
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
  val projects: List<string>,
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    { name: "Sam Zhou", github, projects: l }
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
    ],
  ]);
  const service = new LanguageServices(state, () => 'foo bar');
  expect(service.formatEntireDocument(testModuleReference)).toBe('foo bar');
  expect(service.formatEntireDocument(new ModuleReference(['dsafadfasd']))).toBe(null);
});

it('LanguageServices format test with bad programs', () => {
  const testModuleReference = new ModuleReference(['Test']);
  const state = new LanguageServiceState([
    [
      testModuleReference,
      `
class Developer(
  val name: string, val github: string,
  val projects: List<string>,
) {
  function sam(): Developer = {
    { name: projects:  }.
  }
}
`,
    ],
  ]);
  const service = new LanguageServices(state, () => 'foo bar');
  expect(service.formatEntireDocument(testModuleReference)).toBe(null);
});
