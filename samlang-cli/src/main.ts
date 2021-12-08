/* eslint-disable no-console */

import {
  compileSamlangSources,
  ModuleReference,
  reformatSamlangSources,
} from '@dev-sam/samlang-core';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import cliMainRunner, { CLIRunners } from './cli';
import type { SamlangProjectConfiguration } from './configuration';
import ASCII_ART_SAMLANG_LOGO from './logo';
import { collectSources, getConfiguration } from './utils';

async function compileEverything(configuration: SamlangProjectConfiguration): Promise<void> {
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

  await mkdir(configuration.outputDirectory, { recursive: true });
  await Promise.all(
    Object.entries(result.emittedCode).map(async ([filename, content]) => {
      await writeFile(join(configuration.outputDirectory, filename), content);
    })
  );
}

const runners: CLIRunners = {
  async format(needHelp) {
    if (needHelp) {
      console.log('samlang format: Format your codebase according to sconfig.json.');
    } else {
      await Promise.all(
        reformatSamlangSources(
          collectSources(getConfiguration(), (parts) => new ModuleReference(parts))
        ).map(([moduleReference, newCode]) => writeFile(moduleReference.toFilename(), newCode))
      );
    }
  },
  async compile(needHelp) {
    if (needHelp) {
      console.log('samlang compile: Compile your codebase according to sconfig.json.');
    } else {
      await compileEverything(getConfiguration());
    }
  },
  async help() {
    console.log(`${ASCII_ART_SAMLANG_LOGO}
Usage:
samlang [command]

Commands:
[no command]: defaults to check command specified below.
compile: Compile your codebase according to sconfig.json.
help: Show this message.`);
  },
};

export default function samlangCLIMainFunction(): Promise<void> {
  return cliMainRunner(runners, process.argv.slice(2));
}
