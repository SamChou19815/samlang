import ModuleReference from '../../ast/common/module-reference';
import Position from '../../ast/common/position';
import { stringType } from '../../ast/common/types';
import { LanguageServiceState, LanguageServices, CompletionItemKinds } from '../language-service';

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
  const service = new LanguageServices(state);

  expect(service.queryType(testModuleReference, new Position(100, 100))).toBeNull();
  expect(service.queryType(testModuleReference, new Position(2, 27))?.[0]).toEqual(stringType);
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
  const service = new LanguageServices(state);

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
