import runSamlangDemo from '..';

it('runSamlangDemo works when given good program.', () => {
  expect(runSamlangDemo('class Main { function main(): unit = println("hello world") }')).toEqual({
    interpreterPrinted: 'hello world\n',
    prettyPrintedProgram: `class Main { function main(): unit = println("hello world")  }\n`,
    jsString: `const _builtin_stringConcat = (a, b) => a + b;
const _builtin_println = (line) => console.log(line);
const _builtin_stringToInt = (v) => BigInt(v);
const _builtin_intToString = (v) => String(v);
const _builtin_throw = (v) => { throw Error(v); };

const GLOBAL_STRING_0 = "hello world";
const _module_Demo_class_Main_function_main = () => {
  _builtin_println(GLOBAL_STRING_0);
  return 0;
};
const _compiled_program_main = () => {
  _module_Demo_class_Main_function_main();
  return 0;
};

_compiled_program_main();`,
    llvmString: `declare i64* @_builtin_malloc(i64) nounwind
declare i64 @_builtin_println(i64*) nounwind
declare i64 @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind

; @GLOBAL_STRING_0 = 'hello world'
@GLOBAL_STRING_0 = private unnamed_addr constant [12 x i64] [i64 11, i64 104, i64 101, i64 108, i64 108, i64 111, i64 32, i64 119, i64 111, i64 114, i64 108, i64 100], align 8
define i64 @_module_Demo_class_Main_function_main() local_unnamed_addr nounwind {
l__module_Demo_class_Main_function_main_0_START:
  %_temp_0_string_name_cast = bitcast [12 x i64]* @GLOBAL_STRING_0 to i64*
  call i64 @_builtin_println(i64* %_temp_0_string_name_cast) nounwind
  ret i64 0
}
define i64 @_compiled_program_main() local_unnamed_addr nounwind {
l__compiled_program_main_0_START:
  call i64 @_module_Demo_class_Main_function_main() nounwind
  ret i64 0
}`,
    assemblyString: `    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl _compiled_program_main
_module_Demo_class_Main_function_main:
    push rbp
    mov rbp, rsp
    lea rdi, qword ptr [rip+GLOBAL_STRING_0]
    call _builtin_println
    mov rax, 0
    mov rsp, rbp
    pop rbp
    ret
_compiled_program_main:
    push rbp
    mov rbp, rsp
    lea rdi, qword ptr [rip+GLOBAL_STRING_0]
    call _builtin_println
    mov rax, 0
    mov rsp, rbp
    pop rbp
    ret
    .data
    .align 8
GLOBAL_STRING_0:
    .quad 11
    .quad 104 ## h
    .quad 101 ## e
    .quad 108 ## l
    .quad 108 ## l
    .quad 111 ## o
    .quad 32 ## ${' '}
    .quad 119 ## w
    .quad 111 ## o
    .quad 114 ## r
    .quad 108 ## l
    .quad 100 ## d
    .text
`,
    errors: [],
  });
});

it('runSamlangDemo works when given non-runnable program', () => {
  expect(runSamlangDemo('class Main {}')).toEqual({
    prettyPrintedProgram: 'class Main {  }\n',
    interpreterPrinted: '',
    jsString: '// No JS output because there is no Main.main() function\n',
    assemblyString: undefined,
    errors: [],
  });
});

it('runSamlangDemo works when program with type error.', () => {
  expect(runSamlangDemo('class Main { function main(): string = 42 + "" }')).toEqual({
    errors: [
      'Demo.sam:1:40-1:47: [UnexpectedType]: Expected: `string`, actual: `int`.',
      'Demo.sam:1:45-1:47: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ],
  });
});
