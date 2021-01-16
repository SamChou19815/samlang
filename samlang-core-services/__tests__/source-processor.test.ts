import { parseSources, checkSources, lowerSourcesToLLVMModules } from '../source-processor';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';

it('parseSources test', () => {
  expect(
    parseSources([
      [new ModuleReference(['Test1']), 'class Main { function main(): unit = {} }'],
      // with syntax error
      [new ModuleReference(['Test2']), 'class Main { function main(): unt = {} }'],
    ]).length
  ).toBe(1);
});

it('hello world processor test', () => {
  const moduleReference = new ModuleReference(['Test']);
  const sourceCode = `
  class Main {
    function main(): unit = println("Hello "::"World!")
  }
  `;

  const { checkedSources, compileTimeErrors } = checkSources([[moduleReference, sourceCode]]);
  expect(compileTimeErrors).toEqual([]);

  const llvmModule = lowerSourcesToLLVMModules(checkedSources).forceGet(moduleReference);
  expect(prettyPrintLLVMModule(llvmModule)).toBe(`declare i64* @_builtin_malloc(i64) nounwind
declare i64 @_builtin_println(i64*) nounwind
declare i64 @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind

; @GLOBAL_STRING_0 = 'Hello World!'
@GLOBAL_STRING_0 = private unnamed_addr constant [13 x i64] [i64 12, i64 72, i64 101, i64 108, i64 108, i64 111, i64 32, i64 87, i64 111, i64 114, i64 108, i64 100, i64 33], align 8
define i64 @_compiled_program_main() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [13 x i64]* @GLOBAL_STRING_0 to i64*
  call i64 @_builtin_println(i64* %_temp_0_string_name_cast) nounwind
  ret i64 0
}`);
});
