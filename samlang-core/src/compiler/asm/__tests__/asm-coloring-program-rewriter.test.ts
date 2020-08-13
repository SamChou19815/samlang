import {
  ASM_CONST,
  ASM_REG,
  ASM_MEM_CONST,
  ASM_MEM,
  RAX,
  RBX,
} from '../../../ast/asm/asm-arguments';
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
} from '../../../ast/asm/asm-instructions';
import assemblyInstructionColoringRewrite from '../asm-coloring-program-rewriter';
import { AssemblyMemoryMapping } from '../asm-memory-mapping';

const mockColors = new Map([
  ['a', 'rax'],
  ['b', 'rbx'],
]);
const mockMemoryMapping = new AssemblyMemoryMapping();
mockMemoryMapping.set(ASM_MEM_CONST(ASM_CONST(1)), ASM_MEM_CONST(ASM_CONST(2)));

const rewrite = (instructions: readonly AssemblyInstruction[]): string =>
  assemblyInstructionColoringRewrite(mockColors, mockMemoryMapping, new Set(['rbx']), instructions)
    .map(assemblyInstructionToString)
    .join('\n');

const A = ASM_REG('a');
const B = ASM_REG('b');
const FORTY_TWO = ASM_CONST(42);
const MEM_COMPLEX = ASM_MEM(A, { baseRegister: B, multipliedConstant: 2 }, FORTY_TWO);

it('assemblyInstructionColoringRewrite test 1', () => {
  expect(
    rewrite([
      ASM_MOVE_CONST_TO_REG(A, BigInt(10000000000)),
      ASM_MOVE_REG(B, FORTY_TWO),
      ASM_MOVE_REG(RAX, A),
      ASM_MOVE_REG(A, MEM_COMPLEX),
      ASM_MOVE_MEM(ASM_MEM_CONST(ASM_CONST(1)), FORTY_TWO),
      ASM_MOVE_MEM(MEM_COMPLEX, B),
      ASM_LEA(A, MEM_COMPLEX),
      ASM_CMP_MEM(B, MEM_COMPLEX),
      ASM_CMP_CONST_OR_REG(MEM_COMPLEX, B),
      ASM_CMP_CONST_OR_REG(MEM_COMPLEX, FORTY_TWO),
      ASM_SET('je', RAX),
      ASM_JUMP('jmp', 'label'),
      ASM_CALL(MEM_COMPLEX),
      ASM_CALL(FORTY_TWO),
      ASM_CALL(ASM_MEM_CONST(ASM_CONST(3))),
      ASM_RET,
      ASM_BIN_OP_MEM_DEST('add', MEM_COMPLEX, A),
      ASM_BIN_OP_REG_DEST('xor', A, RBX),
      ASM_IMUL(A, B),
      ASM_IMUL(A, MEM_COMPLEX),
      ASM_IMUL(A, MEM_COMPLEX, FORTY_TWO),
      ASM_IDIV(MEM_COMPLEX),
      ASM_NEG(MEM_COMPLEX),
      ASM_SHL(B, 3),
      ASM_SHL(MEM_COMPLEX, 3),
      ASM_PUSH(MEM_COMPLEX),
      ASM_POP_RBP,
      ASM_LABEL('label'),
      ASM_COMMENT('comment haha'),
    ])
  ).toBe(`movabs rax, 10000000000
## unnecessary 'mov rbx, [mem]' is optimized away.
## 'mov rax, rax' is optimized away.
mov rax, qword ptr [rax+rbx*2+42]
mov qword ptr [2], 42
## unnecessary 'mov [mem], rbx' is optimized away.
lea rax, qword ptr [rax+rbx*2+42]
cmp rbx, qword ptr [rax+rbx*2+42]
cmp qword ptr [rax+rbx*2+42], rbx
cmp qword ptr [rax+rbx*2+42], 42
sete al
movzx rax, al
jmp label
call qword ptr [rax+rbx*2+42]
call 42
call qword ptr [3]
ret
add qword ptr [rax+rbx*2+42], rax
xor rax, rbx
imul rax, rbx
imul rax, qword ptr [rax+rbx*2+42]
imul rax, qword ptr [rax+rbx*2+42], 42
idiv qword ptr [rax+rbx*2+42]
neg qword ptr [rax+rbx*2+42]
shl rbx, 3
shl qword ptr [rax+rbx*2+42], 3
push qword ptr [rax+rbx*2+42]
pop rbp
label:
## comment haha`);
});
