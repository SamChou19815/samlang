import getAssemblyMemoryTilingForMidIRExpression from '../asm-memory-tiling';
import {
  AssemblyTilingServiceBasic,
  createAssemblyMidIRExpressionTilingResult,
} from '../asm-tiling-results';

import { ASM_REG, assemblyArgumentToString, ASM_MEM, RIP } from 'samlang-core-ast/asm-arguments';
import { assemblyInstructionToString, ASM_MOVE_MEM } from 'samlang-core-ast/asm-instructions';
import {
  MidIRExpression,
  MIR_ONE,
  MIR_EIGHT,
  MIR_NAME,
  MIR_CONST,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
} from 'samlang-core-ast/mir-nodes';
import { Long } from 'samlang-core-utils';

const mockedService: AssemblyTilingServiceBasic = {
  tileExpression(expression) {
    switch (expression.__type__) {
      case 'MidIRTemporaryExpression':
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

const tile = (expression: MidIRExpression): string | null => {
  const result = getAssemblyMemoryTilingForMidIRExpression(expression, mockedService);
  if (result == null) return null;
  const { instructions, assemblyArgument } = result;
  const memoryString = assemblyArgumentToString(assemblyArgument);
  if (instructions.length === 0) return memoryString;
  const instructionsString = instructions.map((it) => assemblyInstructionToString(it)).join('\n');
  return `${instructionsString}\n${memoryString}`;
};

it('getAssemblyMemoryTilingForMidIRExpression name test', () => {
  expect(tile(MIR_NAME('a'))).toBe('## force named address with rip: a\nqword ptr [rip+a]');
});

it('getAssemblyMemoryTilingForMidIRExpression memory test', () => {
  expect(tile(MIR_IMMUTABLE_MEM(MIR_NAME('a')))).toBeNull();
});

it('getAssemblyMemoryTilingForMidIRExpression case 1 test', () => {
  expect(tile(MIR_ONE)).toBe('qword ptr [1]');
  expect(tile(MIR_CONST(Long.fromString('10000000000000')))).toBeNull();
});

it('getAssemblyMemoryTilingForMidIRExpression case 2 test', () => {
  expect(tile(MIR_TEMP('a'))).toBe('qword ptr [a]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 3 test', () => {
  expect(tile(MIR_OP('+', MIR_OP('+', MIR_TEMP('a'), MIR_TEMP('a')), MIR_ONE))).toBe(
    'qword ptr [a+a*1+1]'
  );

  expect(
    tile(MIR_OP('+', MIR_OP('+', MIR_TEMP('b'), MIR_ONE), MIR_OP('*', MIR_TEMP('a'), MIR_EIGHT)))
  ).toBe('qword ptr [b+a*8+1]');
  expect(
    tile(MIR_OP('+', MIR_OP('*', MIR_TEMP('a'), MIR_EIGHT), MIR_OP('+', MIR_TEMP('b'), MIR_ONE)))
  ).toBe('qword ptr [b+a*8+1]');

  expect(
    tile(MIR_OP('+', MIR_OP('+', MIR_OP('*', MIR_TEMP('b'), MIR_EIGHT), MIR_ONE), MIR_TEMP('a')))
  ).toBe('qword ptr [a+b*8+1]');
  expect(
    tile(MIR_OP('+', MIR_TEMP('a'), MIR_OP('+', MIR_OP('*', MIR_TEMP('b'), MIR_EIGHT), MIR_ONE)))
  ).toBe('qword ptr [a+b*8+1]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 4 test', () => {
  expect(tile(MIR_OP('*', MIR_TEMP('a'), MIR_ONE))).toBe('qword ptr [a*1]');
  expect(tile(MIR_OP('*', MIR_TEMP('a'), MIR_CONST(2)))).toBe('qword ptr [a*2]');
  expect(tile(MIR_OP('*', MIR_TEMP('a'), MIR_CONST(4)))).toBe('qword ptr [a*4]');
  expect(tile(MIR_OP('*', MIR_TEMP('a'), MIR_EIGHT))).toBe('qword ptr [a*8]');
  expect(tile(MIR_OP('*', MIR_TEMP('a'), MIR_CONST(9)))).toBeNull();
  expect(tile(MIR_OP('*', MIR_TEMP('a'), MIR_TEMP('a')))).toBeNull();
});

it('getAssemblyMemoryTilingForMidIRExpression case 5 test', () => {
  expect(tile(MIR_OP('+', MIR_TEMP('a'), MIR_ONE))).toBe('qword ptr [a+1]');
  expect(tile(MIR_OP('-', MIR_TEMP('a'), MIR_ONE))).toBe('qword ptr [a-1]');
});

it('getAssemblyMemoryTilingForMidIRExpression case 6 test', () => {
  expect(tile(MIR_OP('+', MIR_TEMP('a'), MIR_TEMP('a')))).toBe('qword ptr [a+a*1]');
  expect(tile(MIR_OP('+', MIR_TEMP('a'), MIR_OP('*', MIR_TEMP('a'), MIR_EIGHT)))).toBe(
    'qword ptr [a+a*8]'
  );
  expect(tile(MIR_OP('+', MIR_OP('*', MIR_TEMP('a'), MIR_EIGHT), MIR_TEMP('a')))).toBe(
    'qword ptr [a+a*8]'
  );
});

it('getAssemblyMemoryTilingForMidIRExpression case 7 test', () => {
  expect(tile(MIR_OP('+', MIR_OP('*', MIR_TEMP('a'), MIR_EIGHT), MIR_ONE))).toBe(
    'qword ptr [a*8+1]'
  );
});
