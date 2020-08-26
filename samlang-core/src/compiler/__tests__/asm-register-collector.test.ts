import { ASM_CONST, ASM_REG, ASM_MEM, ASM_MEM_CONST, RAX } from '../../ast/asm-arguments';
import {
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
} from '../../ast/asm-instructions';
import collectAssemblyRegistersFromAssemblyInstructions from '../asm-register-collector';

const REG = ASM_REG('reg');
const FORTY_TWO = ASM_CONST(42);
const MEM_COMPLEX = ASM_MEM(REG, { baseRegister: REG, multipliedConstant: 2 }, FORTY_TWO);

it('collectAssemblyRegistersFromAssemblyInstructions test', () => {
  expect(
    Array.from(
      collectAssemblyRegistersFromAssemblyInstructions([
        ASM_MOVE_CONST_TO_REG(REG, BigInt(10000000000)),
        ASM_MOVE_REG(REG, FORTY_TWO),
        ASM_MOVE_REG(REG, REG),
        ASM_MOVE_REG(REG, ASM_MEM_CONST(FORTY_TWO)),
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
      ])
    )
  ).toEqual(['reg']);
});
