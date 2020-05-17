const runDemo = require('.');

it('can run on good programs', () => {
  const {
    interpreterResult,
    interpreterPrinted,
    prettyPrintedProgram,
    assemblyString,
    errors,
  } = runDemo('class Main { function main(): string = { val _ = println("hello"); "world" } }');
  expect(interpreterResult).toBe('"world"');
  expect(interpreterPrinted).toBe('hello\n');
  expect(prettyPrintedProgram).toBeTruthy();
  expect(assemblyString).toBeTruthy();
  expect(errors.length).toBe(0);
});

it('can run on programs with syntax errors', () => {
  const {
    interpreterResult,
    interpreterPrinted,
    prettyPrintedProgram,
    assemblyString,
    errors,
  } = runDemo('class Main { function main(): string =');
  expect(interpreterResult).toBe(null);
  expect(interpreterPrinted).toBe(null);
  expect(prettyPrintedProgram).toBe(null);
  expect(assemblyString).toBe(null);
  expect(errors.length).toBe(1);
});

it('can run on programs with type errors', () => {
  const {
    interpreterResult,
    interpreterPrinted,
    prettyPrintedProgram,
    assemblyString,
    errors,
  } = runDemo('class Main { function main(): string = 3');
  expect(interpreterResult).toBe(null);
  expect(interpreterPrinted).toBe(null);
  expect(prettyPrintedProgram).toBe(null);
  expect(assemblyString).toBe(null);
  expect(errors.length).toBe(1);
});
