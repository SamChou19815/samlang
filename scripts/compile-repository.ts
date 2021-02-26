#!/usr/bin/env node

// @ts-check
/* eslint-disable no-console */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const read = (filename: string): string => fs.readFileSync(filename).toString();

const runWithErrorCheck = (command: string, args: readonly string[] = []): string => {
  const result = spawnSync(command, args, { shell: true, stdio: ['pipe', 'pipe', 'inherit'] });
  if (result.status !== 0) throw new Error(`Command \`${command}\` failed with ${result.status}.`);
  return result.stdout.toString();
};

const basePath = './out';

const getX86Programs = (): readonly string[] => {
  const programs: string[] = [];
  fs.readdirSync(basePath).forEach((filename) => {
    if (filename.startsWith('test') && path.extname(filename) !== '.ll') {
      const fullRelativePath = `${basePath}/${filename}`;
      try {
        fs.accessSync(fullRelativePath, fs.constants.X_OK);
        programs.push(fullRelativePath);
      } catch (_) {
        // Do nothing
      }
    }
  });
  programs.sort((a, b) => a.localeCompare(b));
  return programs;
};

const getJSPrograms = (): readonly string[] => {
  const programs: string[] = [];
  fs.readdirSync(basePath).forEach((filename) => {
    if (filename.startsWith('test') && path.extname(filename) === '.js') {
      programs.push(`${basePath}/${filename}`);
    }
  });
  programs.sort((a, b) => a.localeCompare(b));
  return programs;
};

const interpretPrograms = (programs: readonly string[]): string =>
  programs.map((program) => `#${program}\n${runWithErrorCheck(program)}`).join('\n');

const interpretJSPrograms = (programs: readonly string[]): string =>
  programs
    .map(
      (program) =>
        `#${program.substring(0, program.length - 3)}\n${runWithErrorCheck('node', [program])}`
    )
    .join('\n');

const compare = (expected: string, actual: string): boolean => {
  if (expected === actual) {
    return true;
  }
  console.log('Inconsistency:');
  console.log(`Actual:\n${actual}`);
  return false;
};

console.error('Bundling...');
runWithErrorCheck('yarn', ['workspace', '@dev-sam/samlang-cli', 'bundle ']);
console.error('Bundled!');
console.error('Compiling...');
runWithErrorCheck('./samlang-dev', ['compile']);
console.error('Compiled!');
console.error('Checking generated JS code...');
if (!compare(read('./scripts/snapshot.txt'), interpretJSPrograms(getJSPrograms()))) {
  process.exit(1);
}
console.error('Generated JS code is good.');
if (spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status === 0) {
  console.error('Checking generated machine code...');
  if (!compare(read('./scripts/snapshot.txt'), interpretPrograms(getX86Programs()))) {
    process.exit(1);
  }
  console.error('Generated machine code is good.');
} else {
  console.log('No LLVM toolchain installation. Skipping LLVM IR verification.');
}
