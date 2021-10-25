/* eslint-disable no-console */

import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs';
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
const LLVM_LIBRARY_PATH = join(RUNTIME_PATH, `libsam-${process.platform}.bc`);
const WASM_RUNTIME_PATH = join(RUNTIME_PATH, `libsam.wat`);

const shellOut = (program: string, ...programArguments: readonly string[]): boolean =>
  spawnSync(program, programArguments, { shell: true, stdio: 'inherit' }).status === 0;

function unlinkIfExist(file: string): void {
  if (existsSync(file)) unlinkSync(file);
}

export function compileEverything(configuration: SamlangProjectConfiguration): boolean {
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
  Object.entries(result.emittedTypeScriptCode).forEach(([filename, content]) => {
    writeFileSync(join(configuration.outputDirectory, filename), content);
  });
  const runtimeWatCode = readFileSync(WASM_RUNTIME_PATH).toString();
  const wasmCode = `(module
${runtimeWatCode}
${result.emittedWasmCode}
)
`;
  writeFileSync(join(configuration.outputDirectory, '__all__.unoptimized.wat'), wasmCode);
  const wasmModule = parseWasmText(wasmCode);
  wasmModule.optimize();
  writeFileSync(
    join(configuration.outputDirectory, '__all__.optimized.wat'),
    wasmModule.emitText()
  );
  writeFileSync(join(configuration.outputDirectory, '__all__.wasm'), wasmModule.emitBinary());
  Object.entries(result.emittedWasmRunnerCode).forEach(([filename, content]) => {
    writeFileSync(join(configuration.outputDirectory, filename), content);
  });

  if (spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status !== 0) {
    // eslint-disable-next-line no-console
    console.error('You do not have LLVM toolchain installation. Skipping LLVM targets.');
    return true;
  }

  const assembleResults = Object.entries(result.emittedLLVMCode).map(([filename, content]) => {
    const modulePath = join(configuration.outputDirectory, filename);
    writeFileSync(modulePath, content);

    const outputProgramPath = modulePath.substring(0, modulePath.length - 3);
    const bitcodePath = `${outputProgramPath}.bc`;
    const success =
      shellOut('llvm-link', '-o', bitcodePath, modulePath, LLVM_LIBRARY_PATH) &&
      shellOut('llc', '-O2', '-filetype=obj', '--relocation-model=pic', bitcodePath) &&
      shellOut('gcc', '-o', outputProgramPath, `${outputProgramPath}.o`);
    unlinkIfExist(`${outputProgramPath}.o`);
    return success;
  });
  return assembleResults.every((it) => it);
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
      const successful = compileEverything(getConfiguration());
      if (!successful) {
        console.error('Failed to compile some LLVM programs.');
        process.exit(3);
      }
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
