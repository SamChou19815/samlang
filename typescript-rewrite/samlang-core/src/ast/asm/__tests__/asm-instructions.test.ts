import {
  RAX,
  RBX,
  RCX,
  RDX,
  RSP,
  RBP,
  RSI,
  RDI,
  R8,
  R9,
  R10,
  R11,
  R12,
  R13,
  R14,
  R15,
  ASM_CONST,
  ASM_REG,
  ASM_MEM_CONST,
} from '../asm-arguments';
import {
  assemblyInstructionToString as toString,
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_MEM,
  ASM_MOVE_REG,
  ASM_LEA,
  ASM_CMP_MEM,
  ASM_CMP_CONST_OR_REG,
  ASM_SET,
  ASM_JUMP,
  ASM_CALL,
  ASM_RET,
  ASM_BIN_OP_MEM_DEST,
  ASM_BIN_OP_REG_DEST,
  ASM_IMUL,
  ASM_CQO,
  ASM_IDIV,
  ASM_NEG,
  ASM_SHL,
  ASM_PUSH,
  ASM_POP,
  ASM_LABEL,
  ASM_COMMENT,
} from '../asm-instructions';

const MEM_1 = ASM_MEM_CONST(ASM_CONST(1));

it('assemblyInstructionToString test', () => {
  expect(toString(ASM_MOVE_CONST_TO_REG(RAX, BigInt(2000000000000)))).toBe(
    'movabs rax, 2000000000000'
  );
  expect(toString(ASM_MOVE_CONST_TO_REG(RAX, BigInt(2)))).toBe('mov rax, 2');
  expect(toString(ASM_MOVE_MEM(MEM_1, RAX))).toBe('mov qword ptr [1], rax');
  expect(toString(ASM_MOVE_REG(RAX, MEM_1))).toBe('mov rax, qword ptr [1]');
  expect(toString(ASM_LEA(RAX, MEM_1))).toBe('lea rax, qword ptr [1]');

  expect(toString(ASM_CMP_MEM(RAX, MEM_1))).toBe('cmp rax, qword ptr [1]');
  expect(toString(ASM_CMP_CONST_OR_REG(MEM_1, RAX))).toBe('cmp qword ptr [1], rax');
  expect(toString(ASM_SET('je', RAX))).toBe('sete al\nmovzx rax, al');
  expect(toString(ASM_SET('je', RBX))).toBe('sete bl\nmovzx rbx, bl');
  expect(toString(ASM_SET('je', RCX))).toBe('sete cl\nmovzx rcx, cl');
  expect(toString(ASM_SET('je', RDX))).toBe('sete dl\nmovzx rdx, dl');
  expect(toString(ASM_SET('je', RSI))).toBe('sete sil\nmovzx rsi, sil');
  expect(toString(ASM_SET('je', RDI))).toBe('sete dil\nmovzx rdi, dil');
  expect(toString(ASM_SET('je', RSP))).toBe('sete spl\nmovzx rsp, spl');
  expect(toString(ASM_SET('je', RBP))).toBe('sete bpl\nmovzx rbp, bpl');
  expect(toString(ASM_SET('je', R8))).toBe('sete r8b\nmovzx r8, r8b');
  expect(toString(ASM_SET('je', R9))).toBe('sete r9b\nmovzx r9, r9b');
  expect(toString(ASM_SET('je', R10))).toBe('sete r10b\nmovzx r10, r10b');
  expect(toString(ASM_SET('je', R11))).toBe('sete r11b\nmovzx r11, r11b');
  expect(toString(ASM_SET('je', R12))).toBe('sete r12b\nmovzx r12, r12b');
  expect(toString(ASM_SET('je', R13))).toBe('sete r13b\nmovzx r13, r13b');
  expect(toString(ASM_SET('je', R14))).toBe('sete r14b\nmovzx r14, r14b');
  expect(toString(ASM_SET('je', R15))).toBe('sete r15b\nmovzx r15, r15b');
  expect(() => toString(ASM_SET('je', ASM_REG('aaaaa')))).toThrow();
  expect(toString(ASM_JUMP('jg', 'foo'))).toBe('jg foo');
  expect(toString(ASM_CALL(MEM_1))).toBe('call qword ptr [1]');
  expect(toString(ASM_RET)).toBe('ret');

  expect(toString(ASM_BIN_OP_MEM_DEST('add', MEM_1, RAX))).toBe('add qword ptr [1], rax');
  expect(toString(ASM_BIN_OP_REG_DEST('add', RAX, MEM_1))).toBe('add rax, qword ptr [1]');
  expect(toString(ASM_IMUL(RAX, RAX))).toBe('imul rax, rax');
  expect(toString(ASM_IMUL(RAX, RAX, ASM_CONST(42)))).toBe('imul rax, rax, 42');
  expect(toString(ASM_CQO)).toBe('cqo');
  expect(toString(ASM_IDIV(RAX))).toBe('idiv rax');
  expect(toString(ASM_NEG(RAX))).toBe('neg rax');
  expect(toString(ASM_SHL(RAX, 1))).toBe('shl rax, 1');

  expect(toString(ASM_PUSH(RAX))).toBe('push rax');
  expect(toString(ASM_POP(RAX))).toBe('pop rax');
  expect(toString(ASM_LABEL('l1'))).toBe('l1:');
  expect(toString(ASM_COMMENT('haha'))).toBe('## haha');
});
