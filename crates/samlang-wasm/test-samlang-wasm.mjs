import { assert } from 'console';
import * as samlang from './index.js';

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Actual:\n${actual}\nExpected:\n${expected}`);
  }
}

assertEqual(typeof (await samlang.compile('class')), 'string');
const { tsCode, interpreterResult } = await samlang.compile(
  'class Main { function main(): unit = Process.println("Hi") }'
);
assertEqual(interpreterResult, 'Hi\n');
assert(tsCode.length > 0);

assertEqual(JSON.stringify(await samlang.typeCheck('class Foo {}')), '[]');
