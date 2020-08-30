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

const _module_Demo_class_Main_function_main = () => {
  var _t0 = _builtin_println("hello world");
};
const _compiled_program_main = () => {
  _module_Demo_class_Main_function_main();
};

_compiled_program_main();`,
    assemblyString: `    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl _compiled_program_main
_module_Demo_class_Main_function_main:
    push rbp
    mov rbp, rsp
    lea rax, qword ptr [rip+GLOBAL_STRING_0]
    lea rdi, qword ptr [rax+8]
    call _builtin_println
    mov rsp, rbp
    pop rbp
    ret
_compiled_program_main:
    push rbp
    mov rbp, rsp
    lea rax, qword ptr [rip+GLOBAL_STRING_0]
    lea rdi, qword ptr [rax+8]
    call _builtin_println
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
