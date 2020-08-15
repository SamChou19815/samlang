import { assemblyProgramToString } from '../../ast/asm/asm-program';
import ModuleReference from '../../ast/common/module-reference';
import {
  HIR_IF_ELSE,
  HIR_BINARY,
  HIR_INT,
  HIR_FUNCTION_CALL,
  HIR_NAME,
  HIR_LET,
  HIR_RETURN,
  HIR_ZERO,
  HIR_STRUCT_INITIALIZATION,
  HIR_STRING,
  HIR_INDEX_ACCESS,
  HIR_VARIABLE,
} from '../../ast/hir/hir-expressions';
import { compileSamlangSourcesToHighIRSources } from '../../compiler';
import { assertNotNull } from '../../util/type-assertions';
import {
  checkSources,
  lowerSourcesToAssemblyPrograms,
  highIRSourcesToJSString,
  highIRStatementToString,
  highIRFunctionToString,
  highIRExpressionToString,
} from '../source-processor';

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
        function main(): unit = println('Hello '::'World!')
    }
    `;
  const { checkedSources } = checkSources([[moduleReference, sourceCode]]);
  const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);
  expect(highIRSourcesToJSString(hirSources)).toBe(
    `{const _module_Test_class_Main_function_main = () => {let _t0 = _builtin_throw('dummy');;let _t1 = _builtin_println(0);; }}`
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
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func'),
        returnCollector: 'val',
      })
    )
  ).toBe('let val = func();');
  expect(
    highIRStatementToString(
      HIR_LET({
        name: 'foo',
        assignedExpression: HIR_INT(BigInt(19815)),
      })
    )
  ).toBe(`let foo = 19815;`);
  expect(highIRStatementToString(HIR_RETURN())).toBe('');
  expect(highIRStatementToString(HIR_RETURN(HIR_ZERO))).toBe('return 0;');
  expect(
    highIRStatementToString(
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'st',
        expressionList: [HIR_ZERO, HIR_STRING('bar'), HIR_INT(BigInt(13))],
      })
    )
  ).toBe(`st = [0, 'bar', 13];`);
});

it('HIR function to JS string test', () => {
  expect(
    highIRFunctionToString({
      name: 'baz',
      parameters: ['d', 't', 'i'],
      hasReturn: true,
      body: [
        HIR_LET({
          name: 'b',
          assignedExpression: HIR_INT(BigInt(1857)),
        }),
      ],
    })
  ).toBe(`const baz = (d, t, i) => {let b = 1857;; return;}`);
});

it('HIR expression to JS string test', () => {
  expect(highIRExpressionToString(HIR_INT(BigInt(1305)))).toBe('1305');
  expect(highIRExpressionToString(HIR_STRING('bloop'))).toBe(`'bloop'`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_VARIABLE('samlang'),
        index: 3,
      })
    )
  ).toBe(`samlang[3]`);
  expect(highIRExpressionToString(HIR_VARIABLE('ts'))).toBe('ts');
  expect(highIRExpressionToString(HIR_NAME('key'))).toBe('key');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '!=',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_INT(BigInt(7)),
      })
    )
  ).toBe('7 != 7');
});
