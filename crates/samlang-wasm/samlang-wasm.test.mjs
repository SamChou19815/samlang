// @ts-check

import * as samlang from './samlang-demo';
import { test, expect } from 'bun:test';

test('Program with errors fail to compile.', async () => {
  await samlang.init();
  expect(await samlang.compile('class')).toStartWith('Error');
});

test('Simple programs can be interpreted.', async () => {
  await samlang.init();
  const result = await samlang.compile(
    'class Main { function main(): unit = Process.println("Hi") }'
  );
  if (typeof result === 'string') {
    throw result;
  }
  const { interpreterResult, tsCode } = result;
  expect(interpreterResult).toBe('Hi\n');
  expect(tsCode.length).toBeGreaterThan(0);
});

test('Good programs have no type errors', async () => {
  await samlang.init();
  expect(JSON.stringify(samlang.typeCheck('class Foo {}'))).toBe('[]');
});
