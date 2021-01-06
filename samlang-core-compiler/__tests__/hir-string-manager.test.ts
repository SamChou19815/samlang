import HighIRStringManager from '../hir-string-manager';

it('allocate string global variable test', () => {
  const allocator = new HighIRStringManager();
  expect(allocator.allocateStringArrayGlobalVariable('foobar')).toEqual({
    name: 'GLOBAL_STRING_0',
    content: 'foobar',
  });
  expect(allocator.allocateStringArrayGlobalVariable('foobar2')).toEqual({
    name: 'GLOBAL_STRING_1',
    content: 'foobar2',
  });
  expect(allocator.allocateStringArrayGlobalVariable('foobar')).toEqual({
    name: 'GLOBAL_STRING_0',
    content: 'foobar',
  });

  expect(allocator.globalVariables).toEqual([
    { name: 'GLOBAL_STRING_0', content: 'foobar' },
    { name: 'GLOBAL_STRING_1', content: 'foobar2' },
  ]);
});
