import getAssemblyMemoryTilingForMidIRExpression from '../asm-memory-tiling';
import {
  AssemblyTilingServiceBasic,
  createAssemblyMidIRExpressionTilingResult,
} from '../asm-tiling-results';

import { ASM_REG, assemblyArgumentToString, ASM_MEM, RIP } from 'samlang-core-ast/asm-arguments';
import { assemblyInstructionToString, ASM_MOVE_MEM } from 'samlang-core-ast/asm-instructions';
import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import { Long } from 'samlang-core-utils';

const MIR_EIGHT = HIR_INT(8);
const NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const mockedService: AssemblyTilingServiceBasic = {
  tileExpression(expression) {
    switch (expression.__type__) {
      case 'HighIRVariableExpression':
        return createAssemblyMidIRExpressionTilingResult([], ASM_REG(expression.name));
      default:
        // Throw back a big cost bad result.
        return createAssemblyMidIRExpressionTilingResult(
          [
            ASM_MOVE_MEM(ASM_MEM(), RIP),
            ASM_MOVE_MEM(ASM_MEM(), RIP),
            ASM_MOVE_MEM(ASM_MEM(), RIP),
            ASM_MOVE_MEM(ASM_MEM(), RIP),
            ASM_MOVE_MEM(ASM_MEM(), RIP),
            ASM_MOVE_MEM(ASM_MEM(), RIP),
            ASM_MOVE_MEM(ASM_MEM(), RIP),
          ],
          ASM_REG('___BAD___')
        );
    }
  },
};

const tile = (expression: HighIRExpression): string | null => {
  const result = getAssemblyMemoryTilingForMidIRExpression(expression, mockedService);
  if (result == null) return null;
  const { instructions, assemblyArgument } = result;
  const memoryString = assemblyArgumentToString(assemblyArgument);
  if (instructions.length === 0) return memoryString;
  const instructionsString = instructions.map((it) => assemblyInstructionToString(it)).join('\n');
  return `${instructionsString}\n${memoryString}`;
};

it('getAssemblyMemoryTilingForMidIRExpression name test', () => {
  expect(tile(NAME('a'))).toBe('## force named address with rip: a\nqword ptr [rip+a]');
});

it('getAssemblyMemoryTilingForMidIRExpression memory test', () => {
  expect(
    tile(HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: NAME('a'), index: 0 }))
  ).toBeNull();
});

it('getAssemblyMemoryTilingForMidIRExpression case 1 test', () => {
  expect(tile(HIR_ONE)).toBe('qword ptr [1]');
  expect(tile(HIR_INT(Long.fromString('10000000000000')))).toBeNull();
});

it('getAssemblyMemoryTilingForMidIRExpression case 2 test', () => {
  expect(tile(TEMP('a'))).toBe('qword ptr [a]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 3 test', () => {
  expect(tile(MIR_OP('+', MIR_OP('+', TEMP('a'), TEMP('a')), HIR_ONE))).toBe('qword ptr [a+a*1+1]');

  expect(
    tile(MIR_OP('+', MIR_OP('+', TEMP('b'), HIR_ONE), MIR_OP('*', TEMP('a'), MIR_EIGHT)))
  ).toBe('qword ptr [b+a*8+1]');
  expect(
    tile(MIR_OP('+', MIR_OP('*', TEMP('a'), MIR_EIGHT), MIR_OP('+', TEMP('b'), HIR_ONE)))
  ).toBe('qword ptr [b+a*8+1]');

  expect(
    tile(MIR_OP('+', MIR_OP('+', MIR_OP('*', TEMP('b'), MIR_EIGHT), HIR_ONE), TEMP('a')))
  ).toBe('qword ptr [a+b*8+1]');
  expect(
    tile(MIR_OP('+', TEMP('a'), MIR_OP('+', MIR_OP('*', TEMP('b'), MIR_EIGHT), HIR_ONE)))
  ).toBe('qword ptr [a+b*8+1]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 4 test', () => {
  expect(tile(MIR_OP('*', TEMP('a'), HIR_ONE))).toBe('qword ptr [a*1]');
  expect(tile(MIR_OP('*', TEMP('a'), HIR_INT(2)))).toBe('qword ptr [a*2]');
  expect(tile(MIR_OP('*', TEMP('a'), HIR_INT(4)))).toBe('qword ptr [a*4]');
  expect(tile(MIR_OP('*', TEMP('a'), MIR_EIGHT))).toBe('qword ptr [a*8]');
  expect(tile(MIR_OP('*', TEMP('a'), HIR_INT(9)))).toBeNull();
  expect(tile(MIR_OP('*', TEMP('a'), TEMP('a')))).toBeNull();
});

it('getAssemblyMemoryTilingForMidIRExpression case 5 test', () => {
  expect(tile(MIR_OP('+', TEMP('a'), HIR_ONE))).toBe('qword ptr [a+1]');
  expect(tile(MIR_OP('-', TEMP('a'), HIR_ONE))).toBe('qword ptr [a-1]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 6 test', () => {
  expect(tile(MIR_OP('+', TEMP('a'), TEMP('a')))).toBe('qword ptr [a+a*1]');
  expect(tile(MIR_OP('+', TEMP('a'), MIR_OP('*', TEMP('a'), MIR_EIGHT)))).toBe('qword ptr [a+a*8]');
  expect(tile(MIR_OP('+', MIR_OP('*', TEMP('a'), MIR_EIGHT), TEMP('a')))).toBe('qword ptr [a+a*8]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 7 test', () => {
  expect(tile(MIR_OP('+', MIR_OP('*', TEMP('a'), MIR_EIGHT), HIR_ONE))).toBe('qword ptr [a*8+1]');
});
