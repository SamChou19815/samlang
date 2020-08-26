import { ASM_CONST, ASM_REG, ASM_MEM, RAX, ASM_MEM_CONST } from '../../../ast/asm-arguments';
import {
  AssemblyInstruction,
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_REG,
  ASM_MOVE_MEM,
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
  ASM_IDIV,
  ASM_NEG,
  ASM_SHL,
  ASM_PUSH,
  ASM_POP_RBP,
  ASM_LABEL,
  ASM_COMMENT,
  assemblyInstructionToString,
} from '../../../ast/asm-instructions';
import AssemblyFunctionAbstractRegisterAllocator from '../asm-function-abstract-register-allocator';
import AssemblySpillingProgramWriter from '../asm-spilling-program-rewriter';

const rewrite = (
  instructions: readonly AssemblyInstruction[],
  spilledVariables: readonly string[]
): string => {
  const rewriter = new AssemblySpillingProgramWriter(
    new AssemblyFunctionAbstractRegisterAllocator(),
    instructions,
    new Set(spilledVariables),
    0
  );
  expect(rewriter.getNewTemps().length).toBeGreaterThan(-1);
  return rewriter.getNewInstructions().map(assemblyInstructionToString).join('\n');
};

const REG = ASM_REG('reg');
const FORTY_TWO = ASM_CONST(42);
const MEM_COMPLEX = ASM_MEM(REG, { baseRegister: REG, multipliedConstant: 2 }, FORTY_TWO);

it('AssemblySpillingProgramWriter test 1', () => {
  expect(
    rewrite(
      [
        ASM_MOVE_CONST_TO_REG(REG, BigInt(10000000000)),
        ASM_MOVE_REG(REG, FORTY_TWO),
        ASM_MOVE_REG(REG, REG),
        ASM_MOVE_REG(REG, MEM_COMPLEX),
        ASM_MOVE_MEM(MEM_COMPLEX, FORTY_TWO),
        ASM_MOVE_MEM(MEM_COMPLEX, REG),
        ASM_LEA(REG, MEM_COMPLEX),
        ASM_CMP_MEM(REG, MEM_COMPLEX),
        ASM_CMP_CONST_OR_REG(MEM_COMPLEX, REG),
        ASM_CMP_CONST_OR_REG(MEM_COMPLEX, FORTY_TWO),
        ASM_SET('je', RAX),
        ASM_JUMP('jmp', 'label'),
        ASM_CALL(MEM_COMPLEX),
        ASM_RET,
        ASM_BIN_OP_MEM_DEST('add', MEM_COMPLEX, REG),
        ASM_BIN_OP_REG_DEST('xor', REG, REG),
        ASM_IMUL(REG, REG),
        ASM_IMUL(REG, MEM_COMPLEX),
        ASM_IMUL(REG, MEM_COMPLEX, FORTY_TWO),
        ASM_IDIV(MEM_COMPLEX),
        ASM_NEG(MEM_COMPLEX),
        ASM_SHL(REG, 3),
        ASM_SHL(MEM_COMPLEX, 3),
        ASM_PUSH(MEM_COMPLEX),
        ASM_POP_RBP,
        ASM_LABEL('label'),
        ASM_COMMENT('comment haha'),
      ],
      []
    )
  ).toBe(`movabs reg, 10000000000
mov reg, 42
mov reg, reg
mov reg, qword ptr [reg+reg*2+42]
mov qword ptr [reg+reg*2+42], 42
mov qword ptr [reg+reg*2+42], reg
lea reg, qword ptr [reg+reg*2+42]
cmp reg, qword ptr [reg+reg*2+42]
cmp qword ptr [reg+reg*2+42], reg
cmp qword ptr [reg+reg*2+42], 42
sete al
movzx rax, al
jmp label
call qword ptr [reg+reg*2+42]
ret
add qword ptr [reg+reg*2+42], reg
xor reg, reg
imul reg, reg
imul reg, qword ptr [reg+reg*2+42]
imul reg, qword ptr [reg+reg*2+42], 42
idiv qword ptr [reg+reg*2+42]
neg qword ptr [reg+reg*2+42]
shl reg, 3
shl qword ptr [reg+reg*2+42], 3
push qword ptr [reg+reg*2+42]
pop rbp
label:
## comment haha`);
});

it('AssemblySpillingProgramWriter test 2', () => {
  expect(
    rewrite(
      [
        ASM_MOVE_CONST_TO_REG(REG, BigInt(10000000000)),
        ASM_MOVE_REG(REG, FORTY_TWO),
        ASM_MOVE_MEM(MEM_COMPLEX, REG),
        ASM_LEA(REG, MEM_COMPLEX),
      ],
      ['reg']
    )
  ).toBe(`movabs _ABSTRACT_REG_0, 10000000000
mov qword ptr [rbp-8], _ABSTRACT_REG_0
mov qword ptr [rbp-8], 42
mov _ABSTRACT_REG_1, qword ptr [rbp-8]
mov _ABSTRACT_REG_2, qword ptr [rbp-8]
mov _ABSTRACT_REG_3, qword ptr [rbp-8]
mov qword ptr [_ABSTRACT_REG_1+_ABSTRACT_REG_2*2+42], _ABSTRACT_REG_3
mov _ABSTRACT_REG_5, qword ptr [rbp-8]
mov _ABSTRACT_REG_6, qword ptr [rbp-8]
lea _ABSTRACT_REG_4, qword ptr [_ABSTRACT_REG_5+_ABSTRACT_REG_6*2+42]
mov qword ptr [rbp-8], _ABSTRACT_REG_4`);
});

it('AssemblySpillingProgramWriter test 3', () => {
  expect(
    rewrite(
      [
        ASM_CMP_MEM(REG, MEM_COMPLEX),
        ASM_CMP_CONST_OR_REG(MEM_COMPLEX, REG),
        ASM_CALL(MEM_COMPLEX),
      ],
      ['reg']
    )
  ).toBe(`mov _ABSTRACT_REG_0, qword ptr [rbp-8]
mov _ABSTRACT_REG_1, qword ptr [rbp-8]
mov _ABSTRACT_REG_2, qword ptr [rbp-8]
cmp _ABSTRACT_REG_0, qword ptr [_ABSTRACT_REG_1+_ABSTRACT_REG_2*2+42]
mov _ABSTRACT_REG_3, qword ptr [rbp-8]
mov _ABSTRACT_REG_4, qword ptr [rbp-8]
mov _ABSTRACT_REG_5, qword ptr [rbp-8]
cmp qword ptr [_ABSTRACT_REG_3+_ABSTRACT_REG_4*2+42], _ABSTRACT_REG_5
mov _ABSTRACT_REG_6, qword ptr [rbp-8]
mov _ABSTRACT_REG_7, qword ptr [rbp-8]
call qword ptr [_ABSTRACT_REG_6+_ABSTRACT_REG_7*2+42]`);
});

it('AssemblySpillingProgramWriter test 4', () => {
  expect(rewrite([ASM_PUSH(MEM_COMPLEX)], ['reg'])).toBe(`mov _ABSTRACT_REG_0, qword ptr [rbp-8]
mov _ABSTRACT_REG_1, qword ptr [rbp-8]
push qword ptr [_ABSTRACT_REG_0+_ABSTRACT_REG_1*2+42]`);
});

it('AssemblySpillingProgramWriter test 5', () => {
  expect(
    rewrite(
      [
        ASM_BIN_OP_MEM_DEST('add', MEM_COMPLEX, REG),
        ASM_BIN_OP_REG_DEST('xor', REG, MEM_COMPLEX),
        ASM_IMUL(REG, MEM_COMPLEX),
        ASM_IMUL(REG, MEM_COMPLEX, FORTY_TWO),
      ],
      ['reg']
    )
  ).toBe(`mov _ABSTRACT_REG_0, qword ptr [rbp-8]
mov _ABSTRACT_REG_1, qword ptr [rbp-8]
mov _ABSTRACT_REG_2, qword ptr [rbp-8]
add qword ptr [_ABSTRACT_REG_0+_ABSTRACT_REG_1*2+42], _ABSTRACT_REG_2
mov _ABSTRACT_REG_3, qword ptr [rbp-8]
mov _ABSTRACT_REG_4, qword ptr [rbp-8]
mov _ABSTRACT_REG_5, qword ptr [rbp-8]
xor _ABSTRACT_REG_5, qword ptr [_ABSTRACT_REG_3+_ABSTRACT_REG_4*2+42]
mov qword ptr [rbp-8], _ABSTRACT_REG_5
mov _ABSTRACT_REG_6, qword ptr [rbp-8]
mov _ABSTRACT_REG_7, qword ptr [rbp-8]
mov _ABSTRACT_REG_8, qword ptr [rbp-8]
imul _ABSTRACT_REG_8, qword ptr [_ABSTRACT_REG_6+_ABSTRACT_REG_7*2+42]
mov qword ptr [rbp-8], _ABSTRACT_REG_8
mov _ABSTRACT_REG_10, qword ptr [rbp-8]
mov _ABSTRACT_REG_11, qword ptr [rbp-8]
imul _ABSTRACT_REG_9, qword ptr [_ABSTRACT_REG_10+_ABSTRACT_REG_11*2+42], 42
mov qword ptr [rbp-8], _ABSTRACT_REG_9`);
});

it('AssemblySpillingProgramWriter test 6', () => {
  expect(rewrite([ASM_IDIV(MEM_COMPLEX), ASM_NEG(MEM_COMPLEX), ASM_SHL(MEM_COMPLEX, 3)], ['reg']))
    .toBe(`mov _ABSTRACT_REG_0, qword ptr [rbp-8]
mov _ABSTRACT_REG_1, qword ptr [rbp-8]
idiv qword ptr [_ABSTRACT_REG_0+_ABSTRACT_REG_1*2+42]
mov _ABSTRACT_REG_2, qword ptr [rbp-8]
mov _ABSTRACT_REG_3, qword ptr [rbp-8]
neg qword ptr [_ABSTRACT_REG_2+_ABSTRACT_REG_3*2+42]
mov _ABSTRACT_REG_4, qword ptr [rbp-8]
mov _ABSTRACT_REG_5, qword ptr [rbp-8]
shl qword ptr [_ABSTRACT_REG_4+_ABSTRACT_REG_5*2+42], 3`);
});

it('AssemblySpillingProgramWriter test 7', () => {
  expect(rewrite([ASM_MOVE_REG(REG, REG)], ['reg'])).toBe(`mov _ABSTRACT_REG_0, qword ptr [rbp-8]
mov qword ptr [rbp-8], _ABSTRACT_REG_0`);

  expect(rewrite([ASM_MOVE_REG(REG, ASM_MEM_CONST(FORTY_TWO))], ['reg']))
    .toBe(`mov _ABSTRACT_REG_0, qword ptr [42]
mov qword ptr [rbp-8], _ABSTRACT_REG_0`);
});

it('AssemblySpillingProgramWriter test 8', () => {
  expect(rewrite([ASM_BIN_OP_REG_DEST('add', REG, ASM_REG('a'))], ['reg'])).toBe(
    'add qword ptr [rbp-8], a'
  );
  expect(rewrite([ASM_BIN_OP_REG_DEST('add', REG, FORTY_TWO)], ['reg'])).toBe(
    'add qword ptr [rbp-8], 42'
  );
});
