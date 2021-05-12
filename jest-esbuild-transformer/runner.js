#!/usr/bin/env node

const { existsSync } = require('fs');
const Module = require('module');
const { resolve } = require('path');

const { registerHook } = require('./api');

function main() {
  const [nodeArg, _, scriptArg, ...rest] = process.argv;
  if (process.argv.length >= 3 && existsSync(scriptArg)) {
    process.argv = [nodeArg, resolve(scriptArg), ...rest];
    registerHook();
    Module.runMain();
  } else {
    // eslint-disable-next-line no-console
    console.log('Usage: esr <source-file> [file-options]');
    process.exit(1);
  }
}

main();
