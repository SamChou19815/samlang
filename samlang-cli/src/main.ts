/* eslint-disable no-console */

import { writeFileSync } from 'fs';

import cliMainRunner, { CLIRunners } from './cli';
import { collectSources, compileEverything } from './cli-service';
import { loadSamlangProjectConfiguration, SamlangProjectConfiguration } from './configuration';
import ASCII_ART_SAMLANG_LOGO from './logo';
import startSamlangLanguageServer from './lsp';

import type { Sources } from 'samlang-core-ast/common-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import { prettyPrintSamlangModule } from 'samlang-core-printer';
import { parseSources, checkSources } from 'samlang-core-services';

const getConfiguration = (): SamlangProjectConfiguration => {
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
};

const format = () => {
  const sources = collectSources(getConfiguration());
  parseSources(sources, new Set(Object.keys(DEFAULT_BUILTIN_TYPING_CONTEXT))).forEach(
    ([moduleReference, samlangModule]) => {
      writeFileSync(moduleReference.toFilename(), prettyPrintSamlangModule(100, samlangModule));
    }
  );
};

const typeCheck = (): {
  readonly checkedSources: Sources<SamlangModule>;
  readonly configuration: SamlangProjectConfiguration;
} => {
  const configuration = getConfiguration();
  const { checkedSources, compileTimeErrors } = checkSources(
    collectSources(configuration),
    DEFAULT_BUILTIN_TYPING_CONTEXT
  );
  if (compileTimeErrors.length > 0) {
    console.error(`Found ${compileTimeErrors.length} error(s).`);
    compileTimeErrors
      .map((it) => it.toString())
      .sort((a, b) => a.localeCompare(b))
      .forEach((it) => console.error(it));
    process.exit(1);
  }
  return { checkedSources, configuration };
};

const runners: CLIRunners = {
  format(needHelp) {
    if (needHelp) {
      console.log('samlang format: Format your codebase according to sconfig.json.');
    } else {
      format();
    }
  },
  typeCheck(needHelp) {
    if (needHelp) {
      console.log('samlang check: Type checks your codebase according to sconfig.json.');
    } else {
      typeCheck();
      console.log('No errors!');
    }
  },
  compile(needHelp) {
    if (needHelp) {
      console.log('samlang compile: Compile your codebase according to sconfig.json.');
    } else {
      const {
        checkedSources,
        configuration: { outputDirectory },
      } = typeCheck();
      const successful = compileEverything(checkedSources, outputDirectory);
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

const samlangCLIMainFunction = (): void => cliMainRunner(runners, process.argv.slice(2));

export default samlangCLIMainFunction;
