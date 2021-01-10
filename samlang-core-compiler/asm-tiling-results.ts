import type AssemblyFunctionAbstractRegisterAllocator from './asm-function-abstract-register-allocator';

import type {
  AssemblyConst,
  AssemblyRegister,
  AssemblyMemory,
  AssemblyConstOrRegister,
  AssemblyRegisterOrMemory,
  AssemblyArgument,
} from 'samlang-core-ast/asm-arguments';
import type { AssemblyInstruction } from 'samlang-core-ast/asm-instructions';
import type { MidIRExpression } from 'samlang-core-ast/mir-nodes';

const estimateCostFromInstructions = (instructions: readonly AssemblyInstruction[]): number => {
  let cost = 0;
  instructions.forEach((instruction) => {
    switch (instruction.__type__) {
      case 'AssemblyLabel':
      case 'AssemblyComment':
      case 'AssemblyNeg':
        return;
      case 'AssemblyIMulTwoArgs':
      case 'AssemblyIMulThreeArgs':
      case 'AssemblyIDiv':
        cost += 4;
        return;
      case 'AssemblyLoadEffectiveAddress':
        cost += 2;
        return;
      default:
        cost += 1;
    }
  });
  return cost;
};

export interface AssemblyArgumentTilingResult<E extends AssemblyArgument = AssemblyArgument> {
  readonly instructions: readonly AssemblyInstruction[];
  readonly assemblyArgument: E;
  readonly cost: number;
}

export type AssemblyRegisterOrMemoryTilingResult<
  E extends AssemblyRegisterOrMemory = AssemblyRegisterOrMemory
> = AssemblyArgumentTilingResult<E>;

export type AssemblyConstOrRegisterTilingResult<
  E extends AssemblyConstOrRegister = AssemblyConstOrRegister
> = AssemblyArgumentTilingResult<E>;

export type AssemblyConstantTilingResult = AssemblyConstOrRegisterTilingResult<AssemblyConst>;

export type AssemblyMemoryTilingResult = AssemblyRegisterOrMemoryTilingResult<AssemblyMemory>;

export interface AssemblyMidIRExpressionTilingResult
  extends AssemblyRegisterOrMemoryTilingResult<AssemblyRegister>,
    AssemblyConstOrRegisterTilingResult<AssemblyRegister> {}

export const createAssemblyConstantTilingResult = (
  constant: AssemblyConst
): AssemblyConstantTilingResult => ({ instructions: [], cost: 0, assemblyArgument: constant });

export const createAssemblyMemoryTilingResult = (
  instructions: readonly AssemblyInstruction[],
  memory: AssemblyMemory
): AssemblyMemoryTilingResult => ({
  instructions,
  cost: estimateCostFromInstructions(instructions),
  assemblyArgument: memory,
});

export const createAssemblyMidIRExpressionTilingResult = (
  instructions: readonly AssemblyInstruction[],
  register: AssemblyRegister
): AssemblyMidIRExpressionTilingResult => ({
  instructions,
  cost: estimateCostFromInstructions(instructions),
  assemblyArgument: register,
});

export interface AssemblyTilingServiceBasic {
  tileExpression(midIRExpression: MidIRExpression): AssemblyMidIRExpressionTilingResult;
}

export interface AssemblyTilingService extends AssemblyTilingServiceBasic {
  readonly allocator: AssemblyFunctionAbstractRegisterAllocator;
  tileRegisterOrMemory(expression: MidIRExpression): AssemblyRegisterOrMemoryTilingResult;
  tileAssemblyArgument(expression: MidIRExpression): AssemblyArgumentTilingResult;
}
