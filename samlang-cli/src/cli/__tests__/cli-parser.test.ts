import parseCLIArguments from '../cli-parser';

it('Can correctly parse', () => {
  expect(parseCLIArguments([])).toEqual({ type: 'check', needHelp: false });
  expect(parseCLIArguments(['check'])).toEqual({ type: 'check', needHelp: false });
  expect(parseCLIArguments(['compile'])).toEqual({ type: 'compile', needHelp: false });
  expect(parseCLIArguments(['lsp'])).toEqual({ type: 'lsp', needHelp: false });
  expect(parseCLIArguments(['check', '--help'])).toEqual({ type: 'check', needHelp: true });
  expect(parseCLIArguments(['compile', '--help'])).toEqual({ type: 'compile', needHelp: true });
  expect(parseCLIArguments(['lsp', '--help'])).toEqual({ type: 'lsp', needHelp: true });
  expect(parseCLIArguments(['check', '-h'])).toEqual({ type: 'check', needHelp: true });
  expect(parseCLIArguments(['compile', '-h'])).toEqual({ type: 'compile', needHelp: true });
  expect(parseCLIArguments(['lsp', '-h'])).toEqual({ type: 'lsp', needHelp: true });
  expect(parseCLIArguments(['version'])).toEqual({ type: 'version' });
  expect(parseCLIArguments(['dfasfsdf'])).toEqual({ type: 'help' });
  expect(parseCLIArguments(['help'])).toEqual({ type: 'help' });
});
