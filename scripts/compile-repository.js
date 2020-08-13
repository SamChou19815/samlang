#!/usr/bin/env node

// @ts-check
/* eslint-disable no-console */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * @param {string} filename
 * @returns {string}
 */
const read = (filename) => fs.readFileSync(filename).toString();

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
const runWithErrorCheck = (command, args = []) => {
  const result = spawnSync(command, args);
  if (result.status !== 0) {
    throw new Error(
      `Command \`${command}\` failed with ${result.status}. Error: ${result.stderr.toString()}`
    );
  }
  return result.stdout.toString();
};

const basePath = './out';

const getX86Programs = () => {
  /** @type {string[]} */
  const programs = [];
  fs.readdirSync(basePath).forEach((filename) => {
    if (filename.startsWith('test') && path.extname(filename) !== '.s') {
      const fullRelativePath = `${basePath}/${filename}`;
      try {
        fs.accessSync(fullRelativePath, fs.constants.X_OK);
        programs.push(fullRelativePath);
        // eslint-disable-next-line no-empty
      } catch (_) {}
    }
  });
  programs.sort((a, b) => a.localeCompare(b));
  return programs;
};

/**
 * @param {string[]} programs
 * @returns {string}
 */
const interpretPrograms = (programs) =>
  programs.map((program) => `#${program}\n${runWithErrorCheck(program)}`).join('\n');

/**
 * @param {string} expected
 * @param {string} actual
 * @returns {boolean}
 */
const compare = (expected, actual) => {
  if (expected === actual) {
    return true;
  }
  console.log('Inconsistency:');
  console.log(`Actual:\n${actual}`);
  return false;
};

console.error('Compiling...');
runWithErrorCheck('./samlang-dev', ['compile']);
console.error('Compiled!');
console.error('Checking generated X86 code...');
if (!compare(read('./scripts/snapshot.txt'), interpretPrograms(getX86Programs()))) {
  process.exit(1);
}
console.error('Generated X86 code is good.');
