type ParsedCLIAction =
  | { readonly type: 'format' | 'compile' | 'lsp'; readonly needHelp: boolean }
  | { readonly type: 'version' }
  | { readonly type: 'help' };

function doesNeedHelp(commandLineArguments: readonly string[]): boolean {
  return commandLineArguments.includes('--help') || commandLineArguments.includes('-h');
}

export function parseCLIArguments(commandLineArguments: readonly string[]): ParsedCLIAction {
  if (commandLineArguments.length === 0) {
    return { type: 'compile', needHelp: false };
  }

  let type: 'format' | 'compile';
  switch (commandLineArguments[0]) {
    case 'format':
    case 'compile':
      type = commandLineArguments[0];
      break;
    case 'version':
      return { type: 'version' };
    default:
      return { type: 'help' };
  }

  return { type, needHelp: doesNeedHelp(commandLineArguments) };
}

export interface CLIRunners {
  format(needHelp: boolean): void;
  compile(needHelp: boolean): void;
  version(): void;
  help(): void;
}

export default function cliMainRunner(
  runners: CLIRunners,
  commandLineArguments: readonly string[]
): void {
  const action = parseCLIArguments(commandLineArguments);
  switch (action.type) {
    case 'format':
      runners.format(action.needHelp);
      return;
    case 'compile':
      runners.compile(action.needHelp);
      return;
    case 'version':
      runners.version();
      return;
    case 'help':
      runners.help();
  }
}
