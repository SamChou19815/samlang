#!/usr/bin/env node
/* eslint-disable no-console */
// @ts-check

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function read(filename: string) {
  return fs.readFileSync(filename).toString();
}

function runWithErrorCheck(command: string, args: readonly string[] = []) {
  const startTime = new Date().getTime();
  const result = spawnSync(command, args, {
    shell: true,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const resultString =
    result.status === 0
      ? result.stdout.toString()
      : `Command \`${command}\` failed with ${result.status}.`;
  const time = new Date().getTime() - startTime;
  return { resultString, time };
}

const basePath = './out';

function compare(expected: string, actual: string) {
  if (expected === actual) return true;
  console.log('Inconsistency:');
  console.log(`Actual:\n${actual}`);
  return false;
}

function timed(runner: () => void): number {
  const start = new Date().getTime();
  runner();
  return new Date().getTime() - start;
}

console.error('Bundling...');
const bundleTime = timed(() =>
  runWithErrorCheck('yarn', ['workspace', '@dev-sam/samlang-cli', 'bundle'])
);
console.error(`Bundled in ${bundleTime}ms!`);
console.error('Compiling...');
runWithErrorCheck('rm', ['-rf', basePath]);
const compileTime = timed(() => runWithErrorCheck('./samlang-cli/bin/index.js', ['compile']));
console.error(`Compiled in ${compileTime}ms!`);
console.error('Checking generated TS code...');
const r1 = runWithErrorCheck('yarn', ['esr', path.join(basePath, 'tests.AllTests.ts')]);
if (!compare(read('./scripts/snapshot.txt'), r1.resultString)) process.exit(1);
console.error(`Generated TS code is good and takes ${r1.time}ms to run.`);

console.error('Checking generated WebAssembly code...');
const r2 = runWithErrorCheck('node', [path.join(basePath, 'tests.AllTests.js')]);
if (!compare(read('./scripts/snapshot.txt'), r2.resultString)) process.exit(1);
console.error(`Generated WebAssembly code is good and takes ${r2.time}ms to run.`);
