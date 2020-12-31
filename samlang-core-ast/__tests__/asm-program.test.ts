import { RAX } from '../asm-arguments';
import { ASM_LABEL, ASM_SET, ASM_RET } from '../asm-instructions';
import { AssemblyProgram, assemblyProgramToString } from '../asm-program';

const program: AssemblyProgram = {
  globalVariables: [
    { name: 'h', content: 'Hello' },
    { name: 'w', content: 'world' },
  ],
  instructions: [ASM_LABEL('_haha'), ASM_SET('jl', RAX), ASM_RET],
};

it('assemblyProgramToString test 1', () => {
  expect(assemblyProgramToString(program)).toBe(`    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl _compiled_program_main
_haha:
    setl al
    movzx rax, al
    ret
    .data
    .align 8
h:
    .quad 5
    .quad 72 ## H
    .quad 101 ## e
    .quad 108 ## l
    .quad 108 ## l
    .quad 111 ## o
    .text
    .data
    .align 8
w:
    .quad 5
    .quad 119 ## w
    .quad 111 ## o
    .quad 114 ## r
    .quad 108 ## l
    .quad 100 ## d
    .text
`);
});

it('assemblyProgramToString test 2', () => {
  expect(assemblyProgramToString(program, false)).toBe(`    .text
    .intel_syntax noprefix
    .p2align 4, 0x90
    .align 8
    .globl __compiled_program_main
__haha:
    setl al
    movzx rax, al
    ret
    .data
    .align 8
h:
    .quad 5
    .quad 72 ## H
    .quad 101 ## e
    .quad 108 ## l
    .quad 108 ## l
    .quad 111 ## o
    .text
    .data
    .align 8
w:
    .quad 5
    .quad 119 ## w
    .quad 111 ## o
    .quad 114 ## r
    .quad 108 ## l
    .quad 100 ## d
    .text
`);
});
