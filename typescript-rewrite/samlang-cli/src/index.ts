/* eslint-disable no-console */

import '@dev-sam/samlang-core';
import cliMainRunner, { CLIRunners } from './cli';

const runners: CLIRunners = {
  typeCheck(needHelp) {
    if (needHelp) {
      console.log('samlang [check]: Type checks your codebase according to sconfig.json.');
    } else {
      console.error('samlang-checker WIP.');
    }
  },
  compile(needHelp) {
    if (needHelp) {
      console.log('samlang compile: Compile your codebase according to sconfig.json.');
    } else {
      console.error('samlang-compiler WIP.');
    }
  },
  lsp(needHelp) {
    if (needHelp) {
      console.log('samlang lsp: Start an LSP process according to sconfig.json.');
    } else {
      console.error('samlang-lsp WIP.');
    }
  },
  version() {
    console.log('samlang version: unreleased.');
  },
  help() {
    console.log(`
Usage:
samlang [command]

Commands:
[no command]: defaults to check command specified below.
check: Type checks your codebase according to sconfig.json.
compile: Compile your codebase according to sconfig.json.
lsp: Start an LSP process according to sconfig.json.
version: Display samlang version.
help: Show this message.`);
  },
};

cliMainRunner(runners, process.argv.slice(2));
