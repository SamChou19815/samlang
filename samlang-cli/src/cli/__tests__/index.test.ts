import cliMainRunner, { CLIRunners } from '..';

const assertCalled = (commandLineArguments: readonly string[], called: keyof CLIRunners): void => {
  const runner: CLIRunners = {
    typeCheck: jest.fn(),
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
};

it('Commands are correctly triggered', () => {
  assertCalled([], 'typeCheck');
  assertCalled(['check'], 'typeCheck');
  assertCalled(['compile'], 'compile');
  assertCalled(['lsp'], 'lsp');
  assertCalled(['check', '--help'], 'typeCheck');
  assertCalled(['compile', '--help'], 'compile');
  assertCalled(['lsp', '--help'], 'lsp');
  assertCalled(['check', '-h'], 'typeCheck');
  assertCalled(['compile', '-h'], 'compile');
  assertCalled(['lsp', '-h'], 'lsp');
  assertCalled(['version'], 'version');
  assertCalled(['dfasfsdf'], 'help');
  assertCalled(['help'], 'help');
});
