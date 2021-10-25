/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  ModuleReference,
  reformatSamlangSources,
  compileSamlangSources,
} from '@dev-sam/samlang-core';
import { parseText as parseWasmText } from 'binaryen';

import cliMainRunner, { CLIRunners } from './cli';
import loadSamlangProjectConfiguration, { SamlangProjectConfiguration } from './configuration';
import ASCII_ART_SAMLANG_LOGO from './logo';
import startSamlangLanguageServer, { collectSources } from './lsp';

function getConfiguration(): SamlangProjectConfiguration {
  const configuration = loadSamlangProjectConfiguration();
  if (
    configuration === 'NO_CONFIGURATION' ||
    configuration === 'UNPARSABLE_CONFIGURATION_FILE' ||
    configuration === 'UNREADABLE_CONFIGURATION_FILE'
  ) {
    console.error(configuration);
    process.exit(2);
  }
  return configuration;
}

const RUNTIME_PATH = join(__dirname, '..', 'samlang-runtime');
const WASM_RUNTIME_PATH = join(RUNTIME_PATH, `libsam.wat`);

function compileEverything(configuration: SamlangProjectConfiguration): void {
  const entryModuleReferences = configuration.entryPoints.map(
    (entryPoint) => new ModuleReference(entryPoint.split('.'))
  );
  const result = compileSamlangSources(collectSources(configuration), entryModuleReferences);
  if (result.__type__ === 'ERROR') {
    // eslint-disable-next-line no-console
    console.error(`Found ${result.errors.length} error(s).`);
    // eslint-disable-next-line no-console
    result.errors.forEach((it) => console.error(it));
    process.exit(1);
  }

  mkdirSync(configuration.outputDirectory, { recursive: true });
  const runtimeWatCode = readFileSync(WASM_RUNTIME_PATH).toString();
  const wasmCode = `(module\n${runtimeWatCode}\n${result.emittedWasmCode}\n)\n`;
  const wasmModule = parseWasmText(wasmCode);
  wasmModule.optimize();
  Object.entries({
    ...result.emittedTypeScriptCode,
    ...result.emittedWasmRunnerCode,
    '__all__.unoptimized.wat': wasmCode,
    '__all__.optimized.wat': wasmModule.emitText(),
    '__all__.wasm': wasmModule.emitBinary(),
  }).forEach(([filename, content]) => {
    writeFileSync(join(configuration.outputDirectory, filename), content);
  });
}

const runners: CLIRunners = {
  format(needHelp) {
    if (needHelp) {
      console.log('samlang format: Format your codebase according to sconfig.json.');
    } else {
      reformatSamlangSources(collectSources(getConfiguration())).forEach(
        ([moduleReference, newCode]) => {
          writeFileSync(moduleReference.toFilename(), newCode);
        }
      );
    }
  },
  compile(needHelp) {
    if (needHelp) {
      console.log('samlang compile: Compile your codebase according to sconfig.json.');
    } else {
      compileEverything(getConfiguration());
    }
  },
  lsp(needHelp) {
    if (needHelp) {
      console.log('samlang lsp: Start an LSP process according to sconfig.json.');
    } else {
      startSamlangLanguageServer(getConfiguration());
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
