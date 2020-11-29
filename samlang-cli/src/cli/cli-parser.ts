type ParsedCLIAction =
  | { readonly type: 'format' | 'check' | 'compile' | 'lsp'; readonly needHelp: boolean }
  | { readonly type: 'version' }
  | { readonly type: 'help' };

const needHelp = (commandLineArguments: readonly string[]): boolean =>
  commandLineArguments.includes('--help') || commandLineArguments.includes('-h');

const parseCLIArguments = (commandLineArguments: readonly string[]): ParsedCLIAction => {
  if (commandLineArguments.length === 0) {
    return { type: 'check', needHelp: false };
  }

  let type: 'format' | 'check' | 'compile' | 'lsp';
  switch (commandLineArguments[0]) {
    case 'format':
    case 'check':
    case 'compile':
    case 'lsp':
      type = commandLineArguments[0];
      break;
    case 'version':
      return { type: 'version' };
    default:
      return { type: 'help' };
  }

  return { type, needHelp: needHelp(commandLineArguments) };
};

export default parseCLIArguments;
