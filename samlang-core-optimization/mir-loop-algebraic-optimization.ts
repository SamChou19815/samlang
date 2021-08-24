import createMidIRFlexibleOrderOperatorNode from 'samlang-core-ast/mir-flexible-op';
import {
  MidIRStatement,
  MIR_ZERO,
  MIR_INT,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import type { MidIROptimizableWhileLoop } from './mir-loop-induction-analysis';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

function analyzeNumberOfIterationsToBreakLessThanGuard(
  initialGuardValue: number,
  guardIncrementAmount: number,
  guardedValue: number
): number | null {
  // Condition is already satisfied, so it does not loop.
  if (initialGuardValue >= guardedValue) return 0;
  // The guardIncrementAmount does not helps to make any progress,
  // so it can loop forever (until wraparound...)
  if (guardIncrementAmount <= 0) return null;
  const difference = guardedValue - initialGuardValue;
  return (
    Math.floor(difference / guardIncrementAmount) +
    (difference % guardIncrementAmount === 0 ? 0 : 1)
  );
}

export function analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING(
  initialGuardValue: number,
  guardIncrementAmount: number,
  operator: '<' | '<=' | '>' | '>=',
  guardedValue: number
): number | null {
  switch (operator) {
    case '<':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        initialGuardValue,
        guardIncrementAmount,
        guardedValue
      );
    case '<=':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        initialGuardValue,
        guardIncrementAmount,
        guardedValue + 1
      );
    case '>':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        -initialGuardValue,
        -guardIncrementAmount,
        -guardedValue
      );
    case '>=':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        -initialGuardValue,
        -guardIncrementAmount,
        -(guardedValue - 1)
      );
  }
}

/** Optimize the loop with number of iteration steps that are statically analyzable. */
export default function midIRLoopAlgebraicOptimization(
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: MidIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator
): readonly MidIRStatement[] | null {
  if (
    basicInductionVariableWithLoopGuard.initialValue.__type__ !== 'MidIRIntLiteralExpression' ||
    basicInductionVariableWithLoopGuard.incrementAmount.__type__ !== 'MidIRIntLiteralExpression' ||
    basicInductionVariableWithLoopGuard.guardExpression.__type__ !== 'MidIRIntLiteralExpression' ||
    loopVariablesThatAreNotBasicInductionVariables.length !== 0 ||
    derivedInductionVariables.length !== 0 ||
    statements.length !== 0
  ) {
    return null;
  }
  const numberOfLoopIterations = analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING(
    basicInductionVariableWithLoopGuard.initialValue.value,
    basicInductionVariableWithLoopGuard.incrementAmount.value,
    basicInductionVariableWithLoopGuard.guardOperator,
    basicInductionVariableWithLoopGuard.guardExpression.value
  );
  if (numberOfLoopIterations == null) return null;
  const basicInductionVariableWithLoopGuardFinalValue =
    basicInductionVariableWithLoopGuard.initialValue.value +
    basicInductionVariableWithLoopGuard.incrementAmount.value * numberOfLoopIterations;
  if (breakCollector == null) {
    // Now we know there is nothing to get from this loop, and the loop has no side effects.
    // Therefore, it is safe to remove everything.
    return [];
  }
  if (breakCollector.value.__type__ !== 'MidIRVariableExpression') {
    // Now we know that the break value is a constant, so we can directly return the assignment
    // without looping around.
    return [
      {
        __type__: 'MidIRBinaryStatement',
        name: breakCollector.name,
        type: breakCollector.type,
        operator: '+',
        e1: breakCollector.value,
        e2: MIR_ZERO,
      },
    ];
  }
  const breakVariable = breakCollector.value.name;
  if (breakVariable === basicInductionVariableWithLoopGuard.name) {
    // We simply want the final value of the basicInductionVariableWithLoopGuard.
    return [
      {
        __type__: 'MidIRBinaryStatement',
        name: breakCollector.name,
        type: breakCollector.type,
        operator: '+',
        e1: MIR_INT(basicInductionVariableWithLoopGuardFinalValue),
        e2: MIR_ZERO,
      },
    ];
  }
  const relevantGeneralInductionVariable = generalInductionVariables.find(
    (it) => it.name === breakVariable
  );
  if (relevantGeneralInductionVariable == null) {
    // Now we know that the break value is a constant, so we can directly return the assignment
    // without looping around.
    return [
      {
        __type__: 'MidIRBinaryStatement',
        name: breakCollector.name,
        type: breakCollector.type,
        operator: '+',
        e1: breakCollector.value,
        e2: MIR_ZERO,
      },
    ];
  }
  const incrementTemporary = allocator.allocateLoopTemporary();
  return [
    MIR_BINARY({
      name: incrementTemporary,
      ...createMidIRFlexibleOrderOperatorNode(
        '*',
        relevantGeneralInductionVariable.incrementAmount,
        MIR_INT(numberOfLoopIterations)
      ),
    }),
    MIR_BINARY({
      name: breakCollector.name,
      ...createMidIRFlexibleOrderOperatorNode(
        '+',
        relevantGeneralInductionVariable.initialValue,
        MIR_VARIABLE(incrementTemporary, MIR_INT_TYPE)
      ),
    }),
  ];
}
