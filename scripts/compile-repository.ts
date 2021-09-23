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

console.error('Bundling...');
runWithErrorCheck('yarn', ['workspace', '@dev-sam/samlang-cli', 'bundle']);
console.error('Bundled!');
console.error('Compiling...');
runWithErrorCheck('rm', ['-rf', basePath]);
runWithErrorCheck('./samlang-cli/bin/index.js', ['compile']);
console.error('Compiled!');
if (!process.env.NO_JS) {
  console.error('Checking generated TS code...');
  const { resultString, time } = runWithErrorCheck('yarn', [
    'esr',
    path.join(basePath, 'tests.AllTests.ts'),
  ]);
  if (!compare(read('./scripts/snapshot.txt'), resultString)) process.exit(1);
  console.error(`Generated TS code is good and takes ${time}ms to run.`);
}
if (
  !process.env.NO_LLVM &&
  spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status === 0
) {
  const { resultString, time } = runWithErrorCheck(path.join(basePath, 'tests.AllTests'));
  console.error('Checking generated machine code...');
  if (!compare(read('./scripts/snapshot.txt'), resultString)) process.exit(1);
  console.error(`Generated machine code is good and takes ${time}ms to run.`);
}
