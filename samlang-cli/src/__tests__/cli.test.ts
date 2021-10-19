import cliMainRunner, { CLIRunners, parseCLIArguments } from '../cli';

function assertCalled(commandLineArguments: readonly string[], called: keyof CLIRunners): void {
  const runner: CLIRunners = {
    format: jest.fn(),
    compile: jest.fn(),
    lsp: jest.fn(),
    version: jest.fn(),
    help: jest.fn(),
  };
  cliMainRunner(runner, commandLineArguments);
  // @ts-expect-error: expected
  Object.keys(runner).forEach((commandName: keyof CLIRunners) => {
    // @ts-expect-error: expected
    expect(runner[commandName].mock.calls.length).toBe(commandName === called ? 1 : 0);
  });
}

describe('samlang-cli/cli', () => {
  it('Can correctly parse', () => {
    expect(parseCLIArguments([])).toEqual({ type: 'compile', needHelp: false });
    expect(parseCLIArguments(['format'])).toEqual({ type: 'format', needHelp: false });
    expect(parseCLIArguments(['compile'])).toEqual({ type: 'compile', needHelp: false });
    expect(parseCLIArguments(['lsp'])).toEqual({ type: 'lsp', needHelp: false });
    expect(parseCLIArguments(['format', '--help'])).toEqual({ type: 'format', needHelp: true });
    expect(parseCLIArguments(['compile', '--help'])).toEqual({ type: 'compile', needHelp: true });
    expect(parseCLIArguments(['lsp', '--help'])).toEqual({ type: 'lsp', needHelp: true });
    expect(parseCLIArguments(['compile', '-h'])).toEqual({ type: 'compile', needHelp: true });
    expect(parseCLIArguments(['lsp', '-h'])).toEqual({ type: 'lsp', needHelp: true });
    expect(parseCLIArguments(['version'])).toEqual({ type: 'version' });
    expect(parseCLIArguments(['dfasfsdf'])).toEqual({ type: 'help' });
    expect(parseCLIArguments(['help'])).toEqual({ type: 'help' });
  });

  it('Commands are correctly triggered', () => {
    assertCalled([], 'compile');
    assertCalled(['format'], 'format');
    assertCalled(['compile'], 'compile');
    assertCalled(['lsp'], 'lsp');
    assertCalled(['format', '--help'], 'format');
    assertCalled(['compile', '--help'], 'compile');
    assertCalled(['lsp', '--help'], 'lsp');
    assertCalled(['compile', '-h'], 'compile');
    assertCalled(['lsp', '-h'], 'lsp');
    assertCalled(['version'], 'version');
    assertCalled(['dfasfsdf'], 'help');
    assertCalled(['help'], 'help');
  });
});
