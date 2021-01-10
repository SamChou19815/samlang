import {
  parseSources,
  checkSources,
  lowerSourcesToLLVMModules,
  lowerSourcesToAssemblyPrograms,
} from '../source-processor';

import { assemblyProgramToString } from 'samlang-core-ast/asm-program';
import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import { assertNotNull } from 'samlang-core-utils';

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

  const llvmModule = lowerSourcesToLLVMModules(checkedSources).get(moduleReference);
  assertNotNull(llvmModule);
  expect(prettyPrintLLVMModule(llvmModule)).toBe(`declare i64* @_builtin_malloc(i64) nounwind
declare void @_builtin_println(i64*) nounwind
declare void @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind

; @GLOBAL_STRING_0 = 'Hello '
@GLOBAL_STRING_0 = private unnamed_addr constant [6 x i64] [i64 6, i64 72, i64 101, i64 108, i64 108, i64 111, i64 32], align 8
; @GLOBAL_STRING_1 = 'World!'
@GLOBAL_STRING_1 = private unnamed_addr constant [6 x i64] [i64 6, i64 87, i64 111, i64 114, i64 108, i64 100, i64 33], align 8
define i64 @_module_Test_class_Main_function_main() local_unnamed_addr nounwind {
l__module_Test_class_Main_function_main_0_START:
  %_temp_0_string_name_cast = bitcast [6 x i64]* @GLOBAL_STRING_0 to i64*
  %_temp_1_string_name_cast = bitcast [6 x i64]* @GLOBAL_STRING_1 to i64*
  %_t0 = call i64* @_builtin_stringConcat(i64* %_temp_0_string_name_cast, i64* %_temp_1_string_name_cast) nounwind
  call i64 @_builtin_println(i64* %_t0) nounwind
  ret i64 0
}
define i64 @_compiled_program_main() local_unnamed_addr nounwind {
l__compiled_program_main_0_START:
  call i64 @_module_Test_class_Main_function_main() nounwind
  ret i64 0
}`);

  const program = lowerSourcesToAssemblyPrograms(checkedSources).get(moduleReference);
  assertNotNull(program);
  expect(assemblyProgramToString(program)).toBe(`    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl _compiled_program_main
_module_Test_class_Main_function_main:
    push rbp
    mov rbp, rsp
    lea rdi, qword ptr [rip+GLOBAL_STRING_0]
    lea rsi, qword ptr [rip+GLOBAL_STRING_1]
    call _builtin_stringConcat
    mov rdi, rax
    call _builtin_println
    mov rax, 0
    mov rsp, rbp
    pop rbp
    ret
_compiled_program_main:
    push rbp
    mov rbp, rsp
    lea rdi, qword ptr [rip+GLOBAL_STRING_0]
    lea rsi, qword ptr [rip+GLOBAL_STRING_1]
    call _builtin_stringConcat
    mov rdi, rax
    call _builtin_println
    mov rax, 0
    mov rsp, rbp
    pop rbp
    ret
    .data
    .align 8
GLOBAL_STRING_0:
    .quad 6
    .quad 72 ## H
    .quad 101 ## e
    .quad 108 ## l
    .quad 108 ## l
    .quad 111 ## o
    .quad 32 ## ${' '}
    .text
    .data
    .align 8
GLOBAL_STRING_1:
    .quad 6
    .quad 87 ## W
    .quad 111 ## o
    .quad 114 ## r
    .quad 108 ## l
    .quad 100 ## d
    .quad 33 ## !
    .text
`);
});
