import midIRLoopAlgebraicOptimization, {
  analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING,
} from '../mir-loop-algebraic-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

it('analyzeNumberOfIterationsToBreakGuard works', () => {
  const analyzeNumberOfIterationsToBreakGuard = (
    initial: number,
    increment: number,
    operator: '<' | '<=' | '>' | '>=',
    guard: number
  ): number | null =>
    analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING(initial, increment, operator, guard);

  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<', 1)).toBe(0);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<=', 1)).toBe(0);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>', 3)).toBe(0);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>=', 3)).toBe(0);

  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<', 3)).toBeNull();
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<=', 3)).toBeNull();
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>', 1)).toBeNull();
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>=', 1)).toBeNull();

  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<', 10)).toBe(4);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<', 11)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<=', 10)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<=', 11)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(10, -2, '>', 2)).toBe(4);
  expect(analyzeNumberOfIterationsToBreakGuard(11, -2, '>', 2)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(10, -2, '>=', 2)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(11, -2, '>=', 2)).toBe(5);
});

it('midIRLoopAlgebraicOptimization can reject unoptimizable loops', () => {
  const allocator = new OptimizationResourceAllocator();

  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_VARIABLE('a', MIR_INT_TYPE),
          incrementAmount: MIR_ZERO,
          guardOperator: '<',
          guardExpression: MIR_ZERO,
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_VARIABLE('a', MIR_INT_TYPE),
          guardOperator: '<',
          guardExpression: MIR_ZERO,
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ZERO,
          guardOperator: '<',
          guardExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ZERO,
          guardOperator: '<',
          guardExpression: MIR_ZERO,
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [
          { name: 'a', baseName: 'aa', multiplier: MIR_ZERO, immediate: MIR_ZERO },
        ],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ZERO,
          guardOperator: '<',
          guardExpression: MIR_ZERO,
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          { name: 'a', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ZERO,
          guardOperator: '<',
          guardExpression: MIR_ONE,
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();
});

it('midIRLoopAlgebraicOptimization works 1/n', () => {
  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ZERO,
          guardOperator: '<',
          guardExpression: MIR_ZERO,
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([]);
});

it('midIRLoopAlgebraicOptimization works 2/n', () => {
  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_INT(5),
          incrementAmount: MIR_ONE,
          guardOperator: '<',
          guardExpression: MIR_INT(20),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE, value: MIR_INT(3) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([MIR_BINARY({ name: 'bc', operator: '+', e1: MIR_INT(3), e2: MIR_ZERO })]);
});

it('midIRLoopAlgebraicOptimization works 3/n', () => {
  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_INT(5),
          incrementAmount: MIR_ONE,
          guardOperator: '<',
          guardExpression: MIR_INT(20),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE, value: MIR_VARIABLE('i', MIR_INT_TYPE) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([MIR_BINARY({ name: 'bc', operator: '+', e1: MIR_INT(20), e2: MIR_ZERO })]);
});

it('midIRLoopAlgebraicOptimization works 4/n', () => {
  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_INT(5),
          incrementAmount: MIR_ONE,
          guardOperator: '<',
          guardExpression: MIR_INT(20),
        },
        generalInductionVariables: [
          {
            name: 'j',
            initialValue: MIR_VARIABLE('j_init', MIR_INT_TYPE),
            incrementAmount: MIR_VARIABLE('outside', MIR_INT_TYPE),
          },
        ],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE, value: MIR_VARIABLE('j', MIR_INT_TYPE) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([
    MIR_BINARY({
      name: '_loop_0',
      operator: '*',
      e1: MIR_VARIABLE('outside', MIR_INT_TYPE),
      e2: MIR_INT(15),
    }),
    MIR_BINARY({
      name: 'bc',
      operator: '+',
      e1: MIR_VARIABLE('j_init', MIR_INT_TYPE),
      e2: MIR_VARIABLE('_loop_0', MIR_INT_TYPE),
    }),
  ]);
});

it('midIRLoopAlgebraicOptimization works 5/n', () => {
  expect(
    midIRLoopAlgebraicOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_INT(5),
          incrementAmount: MIR_ONE,
          guardOperator: '<',
          guardExpression: MIR_INT(20),
        },
        generalInductionVariables: [
          {
            name: 'j',
            initialValue: MIR_VARIABLE('j_init', MIR_INT_TYPE),
            incrementAmount: MIR_VARIABLE('outside', MIR_INT_TYPE),
          },
        ],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE, value: MIR_VARIABLE('aa', MIR_INT_TYPE) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([
    MIR_BINARY({
      name: 'bc',
      operator: '+',
      e1: MIR_VARIABLE('aa', MIR_INT_TYPE),
      e2: MIR_ZERO,
    }),
  ]);
});
