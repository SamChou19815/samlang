import {
  createAssemblyConstantTilingResult,
  createAssemblyMemoryTilingResult,
  createAssemblyMidIRExpressionTilingResult,
} from '../asm-tiling-results';

import { RAX, ASM_CONST, ASM_MEM_CONST, ASM_REG } from 'samlang-core-ast/asm-arguments';
import {
  ASM_MOVE_REG,
  ASM_LEA,
  ASM_CALL,
  ASM_IMUL,
  ASM_IDIV,
  ASM_LABEL,
  ASM_COMMENT,
} from 'samlang-core-ast/asm-instructions';

it('tiling results have correct estimated cost', () => {
  expect(createAssemblyConstantTilingResult(ASM_CONST(1)).cost).toBe(0);
  expect(
    createAssemblyMemoryTilingResult([ASM_MOVE_REG(RAX, RAX)], ASM_MEM_CONST(ASM_CONST(1))).cost
  ).toBe(1);
  expect(
    createAssemblyMidIRExpressionTilingResult(
      [
        ASM_COMMENT(''),
        ASM_LABEL(''),
        ASM_IMUL(RAX, RAX),
        ASM_IMUL(RAX, RAX, ASM_CONST(1)),
        ASM_IDIV(RAX),
        ASM_LEA(RAX, ASM_MEM_CONST(ASM_CONST(1))),
        ASM_CALL(RAX),
      ],
      ASM_REG('')
    ).cost
  ).toBe(15);
});
