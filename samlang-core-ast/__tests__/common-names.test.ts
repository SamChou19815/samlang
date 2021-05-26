import { encodeMainFunctionName, ENCODED_FUNCTION_NAME_THROW } from '../common-names';
import { ModuleReference } from '../common-nodes';

it('Has correct names', () => {
  expect(encodeMainFunctionName(ModuleReference.DUMMY)).toBe(
    '_module___DUMMY___class_Main_function_main'
  );

  expect(encodeMainFunctionName(new ModuleReference(['Foo', 'Bar']))).toBe(
    '_module_Foo__Bar_class_Main_function_main'
  );

  expect(encodeMainFunctionName(new ModuleReference(['Foo-Bar-Derp', 'Baz']))).toBe(
    '_module_Foo_Bar_Derp__Baz_class_Main_function_main'
  );

  expect(ENCODED_FUNCTION_NAME_THROW).toBe('_module__class_Builtins_function_panic');
});
