import ModuleReference from '../module-reference';

it('ModuleReference.toString()', () => {
  expect(ModuleReference.ROOT.toString()).toBe('');
  expect(new ModuleReference(['Foo']).toString()).toBe('Foo');
  expect(new ModuleReference(['Foo', 'Bar']).toString()).toBe('Foo.Bar');
});

it('ModuleReference.toFilename', () => {
  expect(ModuleReference.ROOT.toFilename()).toBe('.sam');
  expect(new ModuleReference(['Foo']).toFilename()).toBe('Foo.sam');
  expect(new ModuleReference(['Foo', 'Bar']).toFilename()).toBe('Foo/Bar.sam');
});

it('ModuleReference.uniqueHash is ModuleReference.toString', () => {
  expect(new ModuleReference(['Foo', 'Bar']).toString()).toBe(
    new ModuleReference(['Foo', 'Bar']).uniqueHash()
  );
});
