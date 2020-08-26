import { assemblyInstructionToString } from '../../../ast/asm-instructions';
import {
  MidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_NAME,
  MIR_CONST,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
} from '../../../ast/mir-nodes';
import getAssemblyTilingForMidIRStatements from '../asm-dp-tiling';
import AssemblyFunctionAbstractRegisterAllocator from '../asm-function-abstract-register-allocator';

const tileStatements = (statements: readonly MidIRStatement[]): string => {
  const lines = getAssemblyTilingForMidIRStatements(
    'functionName',
    statements,
    new AssemblyFunctionAbstractRegisterAllocator()
  ).map(assemblyInstructionToString);
  return lines.slice(0, lines.length - 1).join('\n');
};

it('assembly simple statement tiling tests', () => {
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('foo'), MIR_TEMP('bar'))])).toBe('mov foo, bar');

  expect(tileStatements([MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_ONE), MIR_ZERO)])).toBe(
    'mov qword ptr [1], 0'
  );
  expect(
    tileStatements([
      MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_ONE), MIR_CONST(BigInt(1000000000000))),
    ])
  ).toBe(`movabs _ABSTRACT_REG_0, 1000000000000
mov qword ptr [1], _ABSTRACT_REG_0`);
  expect(
    tileStatements([MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE))])
  ).toBe(`## MEM[1]
mov _ABSTRACT_REG_0, qword ptr [1]
mov qword ptr [1], _ABSTRACT_REG_0`);

  expect(tileStatements([MIR_JUMP('a'), MIR_LABEL('a')])).toBe('jmp a\na:');

  expect(tileStatements([MIR_RETURN()])).toBe(`## return;
jmp LABEL_FUNCTION_CALL_EPILOGUE_FOR_functionName`);
  expect(tileStatements([MIR_RETURN(MIR_ONE)])).toBe(`## return 1;
mov rax, 1
jmp LABEL_FUNCTION_CALL_EPILOGUE_FOR_functionName`);
  expect(tileStatements([MIR_RETURN(MIR_IMMUTABLE_MEM(MIR_NAME('a')))])).toBe(`## return MEM[a];
mov rax, qword ptr [rip+a]
jmp LABEL_FUNCTION_CALL_EPILOGUE_FOR_functionName`);
});

it('assembly cjump statement tiling tests', () => {
  expect(
    tileStatements([
      MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('a'), MIR_IMMUTABLE_MEM(MIR_ONE)), 'a'),
    ])
  ).toBe(`## if ((a < MEM[1])) goto a;
## MEM[1]
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

  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_IMMUTABLE_MEM(MIR_ONE), 'a')]))
    .toBe(`## if (MEM[1]) goto a;
cmp qword ptr [1], 0
jnz a`);
  expect(
    tileStatements([
      MIR_CJUMP_FALLTHROUGH(MIR_OP('+', MIR_TEMP('a'), MIR_IMMUTABLE_MEM(MIR_ONE)), 'a'),
    ])
  ).toBe(`## if ((a + MEM[1])) goto a;
## genericMidIRBinaryExpressionTiler: (a + MEM[1])
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
  expect(tileStatements([MIR_CJUMP_FALLTHROUGH(MIR_OP('^', MIR_TEMP('a'), MIR_ZERO), 'a')]))
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

  expect(tileStatements([MIR_CALL_FUNCTION('fff', [])])).toBe(`## fff();
## We are about to call fff
call fff
## We finished calling fff`);
  expect(tileStatements([MIR_CALL_FUNCTION('fff', [], 'result')])).toBe(`## result = fff();
## We are about to call fff
call fff
mov result, rax
## We finished calling fff`);
  expect(tileStatements([MIR_CALL_FUNCTION('fff', [MIR_ONE])])).toBe(`## fff(1);
## We are about to call fff
mov rdi, 1
call fff
## We finished calling fff`);
  expect(
    tileStatements([
      MIR_CALL_FUNCTION('fff', [MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE]),
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
      MIR_CALL_FUNCTION('fff', [MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE, MIR_ONE]),
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
      MIR_CALL_FUNCTION('fff', [
        MIR_ONE,
        MIR_ONE,
        MIR_ONE,
        MIR_ONE,
        MIR_ONE,
        MIR_ONE,
        MIR_ONE,
        MIR_ONE,
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
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_ONE)])).toBe('mov a, 1');
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_CONST(BigInt(1000000000000)))])).toBe(
    'movabs _ABSTRACT_REG_0, 1000000000000\nmov a, _ABSTRACT_REG_0'
  );
});

it('assembly name tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_NAME('hello-world'))]))
    .toBe(`lea _ABSTRACT_REG_0, qword ptr [rip+hello-world]
mov _, _ABSTRACT_REG_0`);
});

it('assembly memory tiling test', () => {
  expect(
    tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_ONE)))])
  ).toBe(`## MEM[1]
mov _ABSTRACT_REG_0, qword ptr [1]
mov _, qword ptr [_ABSTRACT_REG_0]`);
});

it('assembly comparison expressions tiling test', () => {
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_OP('<', MIR_ONE, MIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 < 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setl al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_OP('<=', MIR_ONE, MIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 <= 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setle al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_OP('>', MIR_ONE, MIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 > 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setg al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_OP('>=', MIR_ONE, MIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 >= 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
setge al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_OP('==', MIR_ONE, MIR_ZERO))]))
    .toBe(`## genericMidIRComparisonBinaryExpressionTiler: (1 == 0)
mov _ABSTRACT_REG_1, 1
mov _ABSTRACT_REG_2, 0
cmp _ABSTRACT_REG_1, _ABSTRACT_REG_2
sete al
movzx rax, al
mov _ABSTRACT_REG_0, rax
mov _, _ABSTRACT_REG_0`);
  expect(tileStatements([MIR_MOVE_TEMP(MIR_TEMP('_'), MIR_OP('!=', MIR_ONE, MIR_ZERO))]))
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
  expect(
    tileStatements([MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('*', MIR_ONE, MIR_CONST(BigInt(65536))))])
  ).toBe(`## multiplyPowerOfTwoBinaryExpressionTiler (1 * 65536)
mov _ABSTRACT_REG_6, 1
shl _ABSTRACT_REG_6, 16
mov a, _ABSTRACT_REG_6`);
});
