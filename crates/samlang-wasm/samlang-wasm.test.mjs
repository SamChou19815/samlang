// @ts-check

import * as fs from 'fs/promises';

// @ts-ignore
fetch = function (/** @type {URL} */ input) {
  return fs.readFile(input);
};
await fs
  .readFile('samlang-demo/package.json')
  .then((text) => {
    const json = JSON.parse(text.toString());
    json.type = 'module';
    return `${JSON.stringify(json, undefined, 2)}\n`;
  })
  .then((text) => fs.writeFile('samlang-demo/package.json', text));

const samlang = await import('./samlang-demo/index.js');

await test('Program with errors fail to compile.', programWithErrorsFailToCompile);
await test('Simple programs can be interpreted.', simpleProgramsCanBeInterpreted);
await test('Good programs have no type errors', goodProgramsHasNoTypeErrors);

async function programWithErrorsFailToCompile() {
  await samlang.init();
  const result = await samlang.compile('class');
  if (typeof result === 'string') {
    assertTrue(result.startsWith('Error'));
  } else {
    assertTrue(false, 'Compilation result has no errors.');
  }
}

async function simpleProgramsCanBeInterpreted() {
  await samlang.init();
  const result = await samlang.compile(
    'class Main { function main(): unit = Process.println("Hi") }'
  );
  if (typeof result === 'string') {
    throw result;
  }
  const { interpreterResult, tsCode } = result;
  assertEquals('Hi\n', interpreterResult);
  assertTrue(tsCode.length > 0, 'Has TS code output');
}

async function goodProgramsHasNoTypeErrors() {
  await samlang.init();
  assertEquals('[]', JSON.stringify(samlang.typeCheck('class Foo {}')));
}

function assertEquals(/** @type {string} */ expected, /** @type {string} */ actual) {
  assertTrue(expected === actual, `Expected:\n${expected}\nActual:\n${actual}`);
}

function assertTrue(/** @type {boolean} */ condition, /** @type {string} */ message) {
  if (!condition) throw message;
}

async function test(/** @type {string} */ testName, /** @type {() => Promise<void>} */ f) {
  console.error('\x1b[32m' + testName);
  await f();
  console.error('\x1b[32mPassing');
}
