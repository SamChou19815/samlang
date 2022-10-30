type ParsedCLIAction =
  | { readonly type: "format" | "compile" | "lsp"; readonly needHelp: boolean }
  | { readonly type: "version" }
  | { readonly type: "help" };

function doesNeedHelp(commandLineArguments: readonly string[]): boolean {
  return commandLineArguments.includes("--help") || commandLineArguments.includes("-h");
}

export function parseCLIArguments(commandLineArguments: readonly string[]): ParsedCLIAction {
  if (commandLineArguments.length === 0) {
    return { type: "compile", needHelp: false };
  }

  let type: "format" | "compile";
  switch (commandLineArguments[0]) {
    case "format":
    case "compile":
      type = commandLineArguments[0];
      break;
    case "version":
      return { type: "version" };
    default:
      return { type: "help" };
  }

  return { type, needHelp: doesNeedHelp(commandLineArguments) };
}

export interface CLIRunners {
  format(needHelp: boolean): Promise<void>;
  compile(needHelp: boolean): Promise<void>;
  help(): Promise<void>;
}

export default async function cliMainRunner(
  runners: CLIRunners,
  commandLineArguments: readonly string[],
): Promise<void> {
  const action = parseCLIArguments(commandLineArguments);
  switch (action.type) {
    case "format":
      await runners.format(action.needHelp);
      return;
    case "compile":
      await runners.compile(action.needHelp);
      return;
    case "help":
      await runners.help();
      return;
  }
}
