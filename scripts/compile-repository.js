#!/usr/bin/env node
/* eslint-disable no-console */
// @ts-check

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const read = (/** @type {string} */ filename) => fs.readFileSync(filename).toString();

const runWithErrorCheck = (/** @type {string} */ command, /** @type {string[]} */ args = []) => {
  const startTime = new Date().getTime();
  const result = spawnSync(command, args, {
    shell: true,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (result.status !== 0) throw new Error(`Command \`${command}\` failed with ${result.status}.`);
  const resultString = result.stdout.toString();
  const time = new Date().getTime() - startTime;
  return { resultString, time };
};

const basePath = './out';

const getX86Programs = () => {
  const programs = [];
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

const getJSPrograms = () => {
  const programs = [];
  fs.readdirSync(basePath).forEach((filename) => {
    if (filename.startsWith('test') && path.extname(filename) === '.js') {
      programs.push(`${basePath}/${filename}`);
    }
  });
  programs.sort((a, b) => a.localeCompare(b));
  return programs;
};

const interpretPrograms = (/** @type {string[]} */ programs) => {
  let totalTime = 0;
  const result = programs
    .map((program) => {
      const { resultString, time } = runWithErrorCheck(program);
      totalTime += time;
      return `#${program}\n${resultString}`;
    })
    .join('\n');
  return { result, totalTime };
};

const interpretJSPrograms = (/** @type {string[]} */ programs) => {
  let totalTime = 0;
  const result = programs
    .map((program) => {
      const { resultString, time } = runWithErrorCheck('node', [program]);
      totalTime += time;
      return `#${program.substring(0, program.length - 3)}\n${resultString}`;
    })
    .join('\n');
  return { result, totalTime };
};

const compare = (/** @type {string} */ expected, /** @type {string} */ actual) => {
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
runWithErrorCheck('./samlang-cli/bin/index.js', ['compile']);
console.error('Compiled!');
if (!process.env.NO_JS) {
  console.error('Checking generated JS code...');
  const { result: jsProgramResult, totalTime: jsTotalTime } = interpretJSPrograms(getJSPrograms());
  if (!compare(read('./scripts/snapshot.txt'), jsProgramResult)) {
    process.exit(1);
  }
  console.error('Generated JS code is good.');
  console.error(`Generated JS code takes ${jsTotalTime}ms to run.`);
}
if (spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status === 0) {
  const { result: nativeProgramResult, totalTime: nativeTotalTime } = interpretPrograms(
    getX86Programs()
  );
  console.error('Checking generated machine code...');
  if (!compare(read('./scripts/snapshot.txt'), nativeProgramResult)) {
    process.exit(1);
  }
  console.error('Generated machine code is good.');
  console.error(`Generated machine code takes ${nativeTotalTime}ms to run.`);
} else {
  console.log('No LLVM toolchain installation. Skipping LLVM IR verification.');
}
