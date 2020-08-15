import { assemblyProgramToString } from '../../ast/asm/asm-program';
import ModuleReference from '../../ast/common/module-reference';
import { compileSamlangSourcesToHighIRSources } from '../../compiler';
import { assertNotNull } from '../../util/type-assertions';
import {
  checkSources,
  lowerSourcesToAssemblyPrograms,
  highIRSourcesToJSString,
  highIRStatementToString,
} from '../source-processor';
import { HIR_IF_ELSE, HIR_BINARY, HIR_INT } from '../../ast/hir/hir-expressions';
import { AND, EQ } from '../../ast/common/binary-operators';

it('hello world processor test', () => {
  const moduleReference = new ModuleReference(['Test']);
  const sourceCode = `
  class Main {
    function main(): unit = println("Hello "::"World!")
  }
  `;

  const { checkedSources, compileTimeErrors } = checkSources([[moduleReference, sourceCode]]);
  expect(compileTimeErrors).toEqual([]);
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
    lea rax, qword ptr [rip+GLOBAL_STRING_0]
    lea rdi, qword ptr [rax+8]
    lea rax, qword ptr [rip+GLOBAL_STRING_1]
    lea rsi, qword ptr [rax+8]
    call _builtin_stringConcat
    mov rdi, rax
    call _builtin_println
    mov rsp, rbp
    pop rbp
    ret
_compiled_program_main:
    push rbp
    mov rbp, rsp
    call _module_Test_class_Main_function_main
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
    .quad 32 ##  
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

it('compile hello world to JS integration test', () => {
  const moduleReference = new ModuleReference(['Test']);
  const sourceCode = `
    class Main {
        function main(): unit = println("Hello "::"World!")
    }
    `;
  const { checkedSources } = checkSources([[moduleReference, sourceCode]]);
  const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);
  expect(highIRSourcesToJSString(hirSources)).toBe(
    `{const _module_Test_class_Main_function_main = () => {let _t0 = _builtin_stringConcat(Hello , World!);let _t1 = _builtin_println(_t0); }}`
  );
});

it('HIR statements to JS string test', () => {
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
        }),
        s1: [
          {
            __type__: 'HighIRReturnStatement',
          },
        ],
        s2: [
          {
            __type__: 'HighIRReturnStatement',
          },
        ],
      })
    )
  ).toBe(`if (5 == 5) {} else {}`);
});
