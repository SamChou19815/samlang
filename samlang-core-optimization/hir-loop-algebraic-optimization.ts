import type { HighIROptimizableWhileLoop } from './hir-loop-induction-analysis';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

import {
  HighIRStatement,
  HIR_ZERO,
  HIR_INT,
  HIR_VARIABLE,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import createHighIRFlexibleOrderOperatorNode from 'samlang-core-ast/hir-flexible-op';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import { Long } from 'samlang-core-utils';

const analyzeNumberOfIterationsToBreakLessThanGuard = (
  initialGuardValue: Long,
  guardIncrementAmount: Long,
  guardedValue: Long
): Long | null => {
  // Condition is already satisfied, so it does not loop.
  if (initialGuardValue.greaterThanOrEqual(guardedValue)) return Long.ZERO;
  // The guardIncrementAmount does not helps to make any progress,
  // so it can loop forever (until wraparound...)
  if (guardIncrementAmount.lessThanOrEqual(0)) return null;
  const difference = guardedValue.subtract(initialGuardValue);
  return difference
    .divide(guardIncrementAmount)
    .add(difference.mod(guardIncrementAmount).equals(0) ? Long.ZERO : Long.ONE);
};

export const analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING = (
  initialGuardValue: Long,
  guardIncrementAmount: Long,
  operator: '<' | '<=' | '>' | '>=',
  guardedValue: Long
): Long | null => {
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
        guardedValue.add(1)
      );
    case '>':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        initialGuardValue.negate(),
        guardIncrementAmount.negate(),
        guardedValue.negate()
      );
    case '>=':
      return analyzeNumberOfIterationsToBreakLessThanGuard(
        initialGuardValue.negate(),
        guardIncrementAmount.negate(),
        guardedValue.subtract(1).negate()
      );
  }
};

/** Optimize the loop with number of iteration steps that are statically analyzable. */
const highIRLoopAlgebraicOptimization = (
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: HighIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator
): readonly HighIRStatement[] | null => {
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
    basicInductionVariableWithLoopGuard.guardExpression.value
  );
  if (numberOfLoopIterations == null) return null;
  const basicInductionVariableWithLoopGuardFinalValue = basicInductionVariableWithLoopGuard.initialValue.value.add(
    basicInductionVariableWithLoopGuard.incrementAmount.value.multiply(numberOfLoopIterations)
  );
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
    (it) => it.name === breakVariable
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
        HIR_INT(numberOfLoopIterations)
      ),
    }),
    HIR_BINARY({
      name: breakCollector.name,
      ...createHighIRFlexibleOrderOperatorNode(
        '+',
        relevantGeneralInductionVariable.initialValue,
        HIR_VARIABLE(incrementTemporary, HIR_INT_TYPE)
      ),
    }),
  ];
};

export default highIRLoopAlgebraicOptimization;
