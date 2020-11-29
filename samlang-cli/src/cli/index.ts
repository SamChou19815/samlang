import parseCLIArguments from './cli-parser';

export interface CLIRunners {
  format(needHelp: boolean): void;
  typeCheck(needHelp: boolean): void;
  compile(needHelp: boolean): void;
  lsp(needHelp: boolean): void;
  version(): void;
  help(): void;
}

const cliMainRunner = (runners: CLIRunners, commandLineArguments: readonly string[]): void => {
  const action = parseCLIArguments(commandLineArguments);
  switch (action.type) {
    case 'format':
      runners.format(action.needHelp);
      return;
    case 'check':
      runners.typeCheck(action.needHelp);
      return;
    case 'compile':
      runners.compile(action.needHelp);
      return;
    case 'lsp':
      runners.lsp(action.needHelp);
      return;
    case 'version':
      runners.version();
      return;
    case 'help':
      runners.help();
  }
};

export default cliMainRunner;
