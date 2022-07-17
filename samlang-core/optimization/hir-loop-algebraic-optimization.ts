import createHighIRFlexibleOrderOperatorNode from '../ast/hir-flexible-op';
import {
  HighIRStatement,
  HIR_BINARY,
  HIR_INT,
  HIR_INT_TYPE,
  HIR_VARIABLE,
  HIR_ZERO,
} from '../ast/hir-nodes';
import type { HighIROptimizableWhileLoop } from './hir-loop-induction-analysis';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

function analyzeNumberOfIterationsToBreakLessThanGuard(
  initialGuardValue: number,
  guardIncrementAmount: number,
  guardedValue: number,
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
  guardedValue: number,
): number | null {
  switch (operator) {
    case '<':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        initialGuardValue,
        guardIncrementAmount,
        guardedValue,
      );
    case '<=':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        initialGuardValue,
        guardIncrementAmount,
        guardedValue + 1,
      );
    case '>':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        -initialGuardValue,
        -guardIncrementAmount,
        -guardedValue,
      );
    case '>=':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        -initialGuardValue,
        -guardIncrementAmount,
        -(guardedValue - 1),
      );
  }
}

/** Optimize the loop with number of iteration steps that are statically analyzable. */
export default function highIRLoopAlgebraicOptimization(
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: HighIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator,
): readonly HighIRStatement[] | null {
  if (
    basicInductionVariableWithLoopGuard.initialValue.__type__ !== 'HighIRIntLiteralExpression' ||
    basicInductionVariableWithLoopGuard.incrementAmount.__type__ !== 'HighIRIntLiteralExpression' ||
    basicInductionVariableWithLoopGuard.guardExpression.__type__ !== 'HighIRIntLiteralExpression' ||
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
    basicInductionVariableWithLoopGuard.guardExpression.value,
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
  if (breakCollector.value.__type__ !== 'HighIRVariableExpression') {
    // Now we know that the break value is a constant, so we can directly return the assignment
    // without looping around.
    return [
      {
        __type__: 'HighIRBinaryStatement',
        name: breakCollector.name,
        type: breakCollector.type,
        operator: '+',
        e1: breakCollector.value,
        e2: HIR_ZERO,
      },
    ];
  }
  const breakVariable = breakCollector.value.name;
  if (breakVariable === basicInductionVariableWithLoopGuard.name) {
    // We simply want the final value of the basicInductionVariableWithLoopGuard.
    return [
      {
        __type__: 'HighIRBinaryStatement',
        name: breakCollector.name,
        type: breakCollector.type,
        operator: '+',
        e1: HIR_INT(basicInductionVariableWithLoopGuardFinalValue),
        e2: HIR_ZERO,
      },
    ];
  }
  const relevantGeneralInductionVariable = generalInductionVariables.find(
    (it) => it.name === breakVariable,
  );
  if (relevantGeneralInductionVariable == null) {
    // Now we know that the break value is a constant, so we can directly return the assignment
    // without looping around.
    return [
      {
        __type__: 'HighIRBinaryStatement',
        name: breakCollector.name,
        type: breakCollector.type,
        operator: '+',
        e1: breakCollector.value,
        e2: HIR_ZERO,
      },
    ];
  }
  const incrementTemporary = allocator.allocateLoopTemporary();
  return [
    HIR_BINARY({
      name: incrementTemporary,
      ...createHighIRFlexibleOrderOperatorNode(
        '*',
        relevantGeneralInductionVariable.incrementAmount,
        HIR_INT(numberOfLoopIterations),
      ),
    }),
    HIR_BINARY({
      name: breakCollector.name,
      ...createHighIRFlexibleOrderOperatorNode(
        '+',
        relevantGeneralInductionVariable.initialValue,
        HIR_VARIABLE(incrementTemporary, HIR_INT_TYPE),
      ),
    }),
  ];
}
