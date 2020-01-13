#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const basePath = './out/x86';

/** @type {string[]} */
const programs = [];
fs.readdirSync(basePath).forEach(filename => {
  if (path.extname(filename) !== '.s') {
    const fullRelativePath = `${basePath}/${filename}`;
    try {
      fs.accessSync(fullRelativePath, fs.constants.X_OK);
      programs.push(fullRelativePath);
    } catch (_) {}
  }
});
programs.sort((a, b) => a.localeCompare(b));

const interpretationStart = new Date().getTime();

const interpretationResult = programs
  .map(program => `#${program}\n${spawnSync(program).stdout.toString()}`)
  .join('\n');
fs.writeFileSync('./scripts/result-to-test-against-snapshot.txt', interpretationResult);

const interpretationTime = new Date().getTime() - interpretationStart;

console.log(`Finished running compiled code. Total time: ${interpretationTime}ms.`);
process.exit(0);
