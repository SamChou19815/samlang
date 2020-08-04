import { RAX, ASM_CONST, ASM_MEM_CONST, ASM_REG } from '../../../ast/asm/asm-arguments';
import {
  ASM_MOVE_REG,
  ASM_LEA,
  ASM_CALL,
  ASM_IMUL,
  ASM_IDIV,
  ASM_LABEL,
  ASM_COMMENT,
} from '../../../ast/asm/asm-instructions';
import {
  createAssemblyTilingResult,
  createAssemblyConstantTilingResult,
  createAssemblyMemoryTilingResult,
  createAssemblyMidIRExpressionTilingResult,
} from '../asm-tiling-results';

it('tiling results have correct estimated cost', () => {
  expect(
    createAssemblyTilingResult([
      ASM_COMMENT(''),
      ASM_LABEL(''),
      ASM_IMUL(RAX, RAX),
      ASM_IMUL(RAX, RAX, ASM_CONST(1)),
      ASM_IDIV(RAX),
      ASM_LEA(RAX, ASM_MEM_CONST(ASM_CONST(1))),
      ASM_CALL(RAX),
    ]).cost
  ).toBe(15);

  expect(createAssemblyConstantTilingResult(ASM_CONST(1)).cost).toBe(0);
  expect(
    createAssemblyMemoryTilingResult([ASM_MOVE_REG(RAX, RAX)], ASM_MEM_CONST(ASM_CONST(1))).cost
  ).toBe(1);
  expect(
    createAssemblyMidIRExpressionTilingResult([ASM_MOVE_REG(RAX, RAX)], ASM_REG('')).cost
  ).toBe(1);
});
