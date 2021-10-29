/* eslint-disable no-console */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  ModuleReference,
  reformatSamlangSources,
  compileSamlangSources,
} from '@dev-sam/samlang-core';

import cliMainRunner, { CLIRunners } from './cli';
import type { SamlangProjectConfiguration } from './configuration';
import ASCII_ART_SAMLANG_LOGO from './logo';
import { getConfiguration, collectSources } from './utils';

function compileEverything(configuration: SamlangProjectConfiguration): void {
  const entryModuleReferences = configuration.entryPoints.map(
    (entryPoint) => new ModuleReference(entryPoint.split('.'))
  );
  const result = compileSamlangSources(
    collectSources(configuration, (parts) => new ModuleReference(parts)),
    entryModuleReferences
  );
  if (result.__type__ === 'ERROR') {
    console.error(`Found ${result.errors.length} error(s).`);
    result.errors.forEach((it) => console.error(it));
    process.exit(1);
  }

  mkdirSync(configuration.outputDirectory, { recursive: true });
  Object.entries(result.emittedCode).forEach(([filename, content]) => {
    writeFileSync(join(configuration.outputDirectory, filename), content);
  });
}

const runners: CLIRunners = {
  format(needHelp) {
    if (needHelp) {
      console.log('samlang format: Format your codebase according to sconfig.json.');
    } else {
      reformatSamlangSources(
        collectSources(getConfiguration(), (parts) => new ModuleReference(parts))
      ).forEach(([moduleReference, newCode]) => {
        writeFileSync(moduleReference.toFilename(), newCode);
      });
    }
  },
  compile(needHelp) {
    if (needHelp) {
      console.log('samlang compile: Compile your codebase according to sconfig.json.');
    } else {
      compileEverything(getConfiguration());
    }
  },
  version() {
    console.log('samlang version: unreleased.');
  },
  help() {
    console.log(`${ASCII_ART_SAMLANG_LOGO}
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

export default function samlangCLIMainFunction(): void {
  cliMainRunner(runners, process.argv.slice(2));
}
