import { encodeMainFunctionName, ENCODED_FUNCTION_NAME_THROW } from '../common-names';
import { ModuleReference } from '../common-nodes';

describe('common-names', () => {
  it('Dummy module has correct name', () => {
    expect(encodeMainFunctionName(ModuleReference.DUMMY)).toBe(
      '_module___DUMMY___class_Main_function_main'
    );
  });

  it('Nested module has correct name', () => {
    expect(encodeMainFunctionName(new ModuleReference(['Foo', 'Bar']))).toBe(
      '_module_Foo__Bar_class_Main_function_main'
    );
  });

  it('Dashed module has correct name', () => {
    expect(encodeMainFunctionName(new ModuleReference(['Foo-Bar-Derp', 'Baz']))).toBe(
      '_module_Foo_Bar_Derp__Baz_class_Main_function_main'
    );
  });

  it('Builtins have correct names', () => {
    expect(ENCODED_FUNCTION_NAME_THROW).toBe('_module__class_Builtins_function_panic');
  });
});
