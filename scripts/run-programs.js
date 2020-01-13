#!/usr/bin/env node

// @ts-check

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * @param {string} filename
 * @returns {string}
 */
const read = filename => fs.readFileSync(filename).toString();

/**
 * @param {string} command
 * @returns {string}
 */
const runWithErrorCheck = command => {
  const result = spawnSync(command);
  if (result.status !== 0) {
    throw new Error(`Command \`${command}\` failed with ${result.status}.`);
  }
  return result.stdout.toString();
};

const basePath = './out/x86';

const getPrograms = () => {
  /** @type {string[]} */
  const programs = [];
  fs.readdirSync(basePath).forEach(filename => {
    if (filename === 'program.s') {
      return;
    }
    if (!filename.startsWith('test.runnable')) {
      return;
    }
    if (path.extname(filename) !== '.s') {
      const fullRelativePath = `${basePath}/${filename}`;
      try {
        fs.accessSync(fullRelativePath, fs.constants.X_OK);
        programs.push(fullRelativePath);
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
const interpretPrograms = programs =>
  programs.map(program => `#${program}\n${runWithErrorCheck(program)}`).join('\n');

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

console.error('Checking generated X86 code...');
if (!compare(read('./scripts/snapshot.txt'), interpretPrograms(getPrograms()))) {
  process.exit(1);
}
console.error('Generated X86 code is good.');
