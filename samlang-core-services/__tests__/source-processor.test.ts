import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';

import { parseSources, checkSources, lowerSourcesToLLVMModules } from '../source-processor';

it('parseSources test', () => {
  expect(
    parseSources(
      [
        [new ModuleReference(['Test1']), 'class Main { function main(): unit = {} }'],
        // with syntax error
        [new ModuleReference(['Test2']), 'class Main { function main(): unt = {} }'],
      ],
      new Set()
    ).length
  ).toBe(1);
});

it('hello world processor test', () => {
  const moduleReference = new ModuleReference(['Test']);
  const sourceCode = `
  class Main {
    function main(): unit = Builtins.println("Hello "::"World!")
  }
  `;

  const { checkedSources, compileTimeErrors } = checkSources(
    [[moduleReference, sourceCode]],
    DEFAULT_BUILTIN_TYPING_CONTEXT
  );
  expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);

  const llvmModule = lowerSourcesToLLVMModules(
    checkedSources,
    DEFAULT_BUILTIN_TYPING_CONTEXT
  ).forceGet(moduleReference);
  expect(prettyPrintLLVMModule(llvmModule)).toBe(`declare i32* @_builtin_malloc(i32) nounwind
declare i32 @_module__class_Builtins_function_println(i32*) nounwind
declare i32* @_module__class_Builtins_function_panic(i32*) nounwind
declare i32* @_module__class_Builtins_function_intToString(i32) nounwind
declare i32 @_module__class_Builtins_function_stringToInt(i32*) nounwind
declare i32* @_builtin_stringConcat(i32*, i32*) nounwind

; @GLOBAL_STRING_0 = 'Hello World!'
@GLOBAL_STRING_0 = private unnamed_addr constant [13 x i32] [i32 12, i32 72, i32 101, i32 108, i32 108, i32 111, i32 32, i32 87, i32 111, i32 114, i32 108, i32 100, i32 33], align 8
define i32 @_compiled_program_main() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [13 x i32]* @GLOBAL_STRING_0 to i32*
  call i32 @_module__class_Builtins_function_println(i32* %_temp_0_string_name_cast) nounwind
  ret i32 0
}`);
});
