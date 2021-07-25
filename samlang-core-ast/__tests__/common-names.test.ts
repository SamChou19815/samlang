import { encodeMainFunctionName, ENCODED_FUNCTION_NAME_THROW } from '../common-names';
import { ModuleReference } from '../common-nodes';

describe('common-names', () => {
  it('Dummy module has correct name', () => {
    expect(encodeMainFunctionName(ModuleReference.DUMMY)).toBe('___DUMMY___Main_main');
  });

  it('Nested module has correct name', () => {
    expect(encodeMainFunctionName(new ModuleReference(['Foo', 'Bar']))).toBe('_Foo$Bar_Main_main');
  });

  it('Dashed module has correct name', () => {
    expect(encodeMainFunctionName(new ModuleReference(['Foo-Bar-Derp', 'Baz']))).toBe(
      '_Foo_Bar_Derp$Baz_Main_main'
    );
  });

  it('Builtins have correct names', () => {
    expect(ENCODED_FUNCTION_NAME_THROW).toBe('__Builtins_panic');
  });
});
