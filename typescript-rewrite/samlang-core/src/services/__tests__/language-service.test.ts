import ModuleReference from '../../ast/common/module-reference';
import LanguageServiceState from '../language-service';

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
