import getAssemblyTilingForMidIRStatements from '../asm-dp-tiling';
import AssemblyFunctionAbstractRegisterAllocator from '../asm-function-abstract-register-allocator';

import { assemblyInstructionToString } from 'samlang-core-ast/asm-instructions';
import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRStatement,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';
import { Long } from 'samlang-core-utils';

const NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0) =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const tileStatements = (statements: readonly MidIRStatement[]): string => {
  const lines = getAssemblyTilingForMidIRStatements(
    'functionName',
    statements,
    new AssemblyFunctionAbstractRegisterAllocator()
  ).map((it) => assemblyInstructionToString(it));
  return lines.slice(0, lines.length - 1).join('\n');
};

it('assembly simple statement tiling tests', () => {
  expect(tileStatements([MIR_MOVE_TEMP('foo', MIR_TEMP('bar'))])).toBe('mov foo, bar');

  expect(tileStatements([MIR_MOVE_IMMUTABLE_MEM(HIR_ONE, HIR_ZERO)])).toBe('mov qword ptr [1], 0');
  expect(
    tileStatements([MIR_MOVE_IMMUTABLE_MEM(HIR_ONE, HIR_INT(Long.fromString('1000000000000')))])
  ).toBe(`movabs _ABSTRACT_REG_0, 1000000000000
mov qword ptr [1], _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_IMMUTABLE_MEM(HIR_ONE, MIR_IMMUTABLE_MEM(HIR_ONE))]))
    .toBe(`## 1[0]
mov _ABSTRACT_REG_0, qword ptr [1]
mov qword ptr [1], _ABSTRACT_REG_0`);

  expect(tileStatements([MIR_JUMP('a'), MIR_LABEL('a')])).toBe('jmp a\na:');

  expect(tileStatements([MIR_RETURN(HIR_ONE)])).toBe(`## return 1;
mov rax, 1
jmp l_FUNCTION_CALL_EPILOGUE_FOR_functionName`);
  expect(tileStatements([MIR_RETURN(MIR_IMMUTABLE_MEM(NAME('a')))])).toBe(`## return a[0];
mov rax, qword ptr [rip+a]
jmp l_FUNCTION_CALL_EPILOGUE_FOR_functionName`);
});

it('assembly cjump statement tiling tests', () => {
  expect(
    tileStatements([
      MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('a'), MIR_IMMUTABLE_MEM(HIR_ONE)), 'a'),
    ])
  ).toBe(`## if ((a < 1[0])) goto a;
## 1[0]
mov _ABSTRACT_REG_0, qword ptr [1]
cmp a, _ABSTRACT_REG_0
jl a`);

  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('<=', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a <= b)) goto a;
cmp a, b
jle a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('>', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a > b)) goto a;
cmp a, b
jg a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('>=', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a >= b)) goto a;
cmp a, b
jge a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a == b)) goto a;
cmp a, b
je a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('!=', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a != b)) goto a;
cmp a, b
jne a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_TEMP('a'), 'a')])).toBe(`## if (a) goto a;
cmp a, 0
jnz a`);

  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_IMMUTABLE_MEM(HIR_ONE), 'a')]))
    .toBe(`## if (1[0]) goto a;
cmp qword ptr [1], 0
jnz a`);
  expect(
    tileStatements([
      MIR_CJUMP_FALLTHROUGH(MIR_OP('+', MIR_TEMP('a'), MIR_IMMUTABLE_MEM(HIR_ONE)), 'a'),
    ])
  ).toBe(`## if ((a + 1[0])) goto a;
## genericMidIRBinaryExpressionTiler: (a + 1[0])
mov _ABSTRACT_REG_0, a
add _ABSTRACT_REG_0, qword ptr [1]
cmp _ABSTRACT_REG_0, 0
jnz a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('-', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a - b)) goto a;
## genericMidIRBinaryExpressionTiler: (a - b)
mov _ABSTRACT_REG_0, a
sub _ABSTRACT_REG_0, b
cmp _ABSTRACT_REG_0, 0
jnz a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('^', MIR_TEMP('a'), HIR_ZERO), 'a')]))
    .toBe(`## if ((a ^ 0)) goto a;
## genericMidIRBinaryExpressionTiler: (a ^ 0)
mov _ABSTRACT_REG_1, 0
mov _ABSTRACT_REG_0, a
xor _ABSTRACT_REG_0, _ABSTRACT_REG_1
cmp _ABSTRACT_REG_0, 0
jnz a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('*', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a * b)) goto a;
## genericMidIRBinaryExpressionTiler: (a * b)
mov _ABSTRACT_REG_0, a
imul _ABSTRACT_REG_0, b
cmp _ABSTRACT_REG_0, 0
jnz a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('/', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a / b)) goto a;
## genericMidIRBinaryExpressionTiler: (a / b)
mov rax, a
cqo
idiv b
mov _ABSTRACT_REG_0, rax
cmp _ABSTRACT_REG_0, 0
jnz a`);
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('%', MIR_TEMP('a'), MIR_TEMP('b')), 'a')]))
    .toBe(`## if ((a % b)) goto a;
## genericMidIRBinaryExpressionTiler: (a % b)
mov rax, a
cqo
idiv b
mov _ABSTRACT_REG_0, rdx
cmp _ABSTRACT_REG_0, 0
jnz a`);
});

it('assembly call function tiling test', () => {
  expect(tileStatements([MIR_CALL_FUNCTION(MIR_TEMP('fff'), [])])).toBe(`## fff();
## We are about to call fff
call fff
## We finished calling fff`);

  expect(tileStatements([MIR_CALL_FUNCTION(NAME('fff'), [])])).toBe(`## fff();
## We are about to call fff
call fff
## We finished calling fff`);
  expect(tileStatements([MIR_CALL_FUNCTION(NAME('fff'), [], 'result')])).toBe(`## result = fff();
## We are about to call fff
call fff
mov result, rax
## We finished calling fff`);
  expect(tileStatements([MIR_CALL_FUNCTION(NAME('fff'), [HIR_ONE])])).toBe(`## fff(1);
## We are about to call fff
mov rdi, 1
call fff
## We finished calling fff`);
  expect(
    tileStatements([
      MIR_CALL_FUNCTION(NAME('fff'), [HIR_ONE, HIR_ONE, HIR_ONE, HIR_ONE, HIR_ONE, HIR_ONE]),
    ])
  ).toBe(`## fff(1, 1, 1, 1, 1, 1);
## We are about to call fff
mov r9, 1
mov r8, 1
mov rcx, 1
mov rdx, 1
mov rsi, 1
mov rdi, 1
call fff
## We finished calling fff`);

  expect(
    tileStatements([
      MIR_CALL_FUNCTION(NAME('fff'), [
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
      ]),
    ])
  ).toBe(`## fff(1, 1, 1, 1, 1, 1, 1);
## We are about to call fff
sub rsp, 8
push 1
mov r9, 1
mov r8, 1
mov rcx, 1
mov rdx, 1
mov rsi, 1
mov rdi, 1
call fff
add rsp, 16
## We finished calling fff`);

  expect(
    tileStatements([
      MIR_CALL_FUNCTION(NAME('fff'), [
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
        HIR_ONE,
      ]),
    ])
  ).toBe(`## fff(1, 1, 1, 1, 1, 1, 1, 1);
## We are about to call fff
push 1
push 1
mov r9, 1
mov r8, 1
mov rcx, 1
mov rdx, 1
mov rsi, 1
mov rdi, 1
call fff
add rsp, 16
## We finished calling fff`);
});

it('assembly constant tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP('a', HIR_ONE)])).toBe('mov a, 1');
  expect(tileStatements([MIR_MOVE_TEMP('a', HIR_INT(Long.fromString('1000000000000')))])).toBe(
    'movabs _ABSTRACT_REG_0, 1000000000000\nmov a, _ABSTRACT_REG_0'
  );
});

it('assembly name tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP('_', NAME('hello-world'))]))
    .toBe(`lea _ABSTRACT_REG_0, qword ptr [rip+hello-world]
mov _, _ABSTRACT_REG_0`);
});

it('assembly memory tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(HIR_ONE)))]))
    .toBe(`## 1[0]
mov _ABSTRACT_REG_0, qword ptr [1]
mov _, qword ptr [_ABSTRACT_REG_0]`);
});

it('assembly comparison expressions tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_OP('<', HIR_ONE, HIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 < 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setl al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_OP('<=', HIR_ONE, HIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 <= 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setle al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_OP('>', HIR_ONE, HIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 > 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setg al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_OP('>=', HIR_ONE, HIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 >= 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setge al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_OP('==', HIR_ONE, HIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 == 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
sete al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP('_', MIR_OP('!=', HIR_ONE, HIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 != 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setne al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
});

it('assembly multiply by power of 2 tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP('a', MIR_OP('*', HIR_ONE, HIR_INT(65536)))]))
    .toBe(`## multiplyPowerOfTwoBinaryExpressionTiler (1 * 65536)
mov _ABSTRACT_REG_6, 1
shl _ABSTRACT_REG_6, 16
mov a, _ABSTRACT_REG_6`);
});
