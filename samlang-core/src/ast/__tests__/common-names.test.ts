import { encodeMainFunctionName, ENCODED_FUNCTION_NAME_THROW } from '../common-names';
import ModuleReference from '../common/module-reference';

it('Has correct names', () => {
  expect(encodeMainFunctionName(ModuleReference.ROOT)).toBe('_module__class_Main_function_main');

  expect(encodeMainFunctionName(new ModuleReference(['Foo', 'Bar']))).toBe(
    '_module_Foo__Bar_class_Main_function_main'
  );

  expect(encodeMainFunctionName(new ModuleReference(['Foo-Bar-Derp', 'Baz']))).toBe(
    '_module_Foo_Bar_Derp__Baz_class_Main_function_main'
  );

  expect(ENCODED_FUNCTION_NAME_THROW).toBe('_builtin_throw');
});
