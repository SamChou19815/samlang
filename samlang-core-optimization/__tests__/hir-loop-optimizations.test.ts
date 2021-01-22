import {
  analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING,
  highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING,
} from '../hir-loop-optimizations';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import { Long } from 'samlang-core-utils';

it('analyzeNumberOfIterationsToBreakGuard works', () => {
  const analyzeNumberOfIterationsToBreakGuard = (
    initial: number,
    increment: number,
    operator: '<' | '<=' | '>' | '>=',
    guard: number
  ): number | undefined =>
    analyzeNumberOfIterationsToBreakGuard_EXPOSED_FOR_TESTING(
      Long.fromInt(initial),
      Long.fromInt(increment),
      operator,
      Long.fromInt(guard)
    )?.toInt();

  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<', 1)).toBe(0);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<=', 1)).toBe(0);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>', 3)).toBe(0);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>=', 3)).toBe(0);

  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<', 3)).toBeUndefined();
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '<=', 3)).toBeUndefined();
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>', 1)).toBeUndefined();
  expect(analyzeNumberOfIterationsToBreakGuard(2, 0, '>=', 1)).toBeUndefined();

  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<', 10)).toBe(4);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<', 11)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<=', 10)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(2, 2, '<=', 11)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(10, -2, '>', 2)).toBe(4);
  expect(analyzeNumberOfIterationsToBreakGuard(11, -2, '>', 2)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(10, -2, '>=', 2)).toBe(5);
  expect(analyzeNumberOfIterationsToBreakGuard(11, -2, '>=', 2)).toBe(5);
});

it('highIRLoopAlgebraicOptimization can reject unoptimizable loops', () => {
  const allocator = new OptimizationResourceAllocator();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_VARIABLE('a', HIR_INT_TYPE),
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_VARIABLE('a', HIR_INT_TYPE),
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [
          {
            name: 'a',
            baseName: 'aa',
            initialValue: HIR_ZERO,
            multiplier: HIR_ZERO,
            immediate: HIR_ZERO,
          },
        ],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [
          { name: 'a', baseName: 'aa', multiplier: HIR_ZERO, immediate: HIR_ZERO },
        ],
        otherLoopVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [
          { name: 'a', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
        ],
        statements: [],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [HIR_RETURN(HIR_ZERO)],
      },
      allocator
    )
  ).toBeNull();

  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ONE,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
      },
      allocator
    )
  ).toBeNull();
});

it('highIRLoopAlgebraicOptimization works 1/n', () => {
  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ZERO,
          guardOperator: '<',
          guardExpression: HIR_ZERO,
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([]);
});

it('highIRLoopAlgebraicOptimization works 2/n', () => {
  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_INT(5),
          incrementAmount: HIR_ONE,
          guardOperator: '<',
          guardExpression: HIR_INT(20),
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: HIR_INT_TYPE, value: HIR_INT(3) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([HIR_BINARY({ name: 'bc', operator: '+', e1: HIR_INT(3), e2: HIR_ZERO })]);
});

it('highIRLoopAlgebraicOptimization works 3/n', () => {
  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_INT(5),
          incrementAmount: HIR_ONE,
          guardOperator: '<',
          guardExpression: HIR_INT(20),
        },
        generalInductionVariables: [],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: HIR_INT_TYPE, value: HIR_VARIABLE('i', HIR_INT_TYPE) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([HIR_BINARY({ name: 'bc', operator: '+', e1: HIR_INT(20), e2: HIR_ZERO })]);
});

it('highIRLoopAlgebraicOptimization works 4/n', () => {
  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_INT(5),
          incrementAmount: HIR_ONE,
          guardOperator: '<',
          guardExpression: HIR_INT(20),
        },
        generalInductionVariables: [
          {
            name: 'j',
            loopValueCollector: 'tmp_j',
            initialValue: HIR_VARIABLE('j_init', HIR_INT_TYPE),
            incrementAmount: HIR_VARIABLE('outside', HIR_INT_TYPE),
          },
        ],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: HIR_INT_TYPE, value: HIR_VARIABLE('j', HIR_INT_TYPE) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([
    HIR_BINARY({
      name: '_loop_0',
      operator: '*',
      e1: HIR_VARIABLE('outside', HIR_INT_TYPE),
      e2: HIR_INT(15),
    }),
    HIR_BINARY({
      name: 'bc',
      operator: '+',
      e1: HIR_VARIABLE('j_init', HIR_INT_TYPE),
      e2: HIR_VARIABLE('_loop_0', HIR_INT_TYPE),
    }),
  ]);
});

it('highIRLoopAlgebraicOptimization works 5/n', () => {
  expect(
    highIRLoopAlgebraicOptimization_EXPOSED_FOR_TESTING(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_INT(5),
          incrementAmount: HIR_ONE,
          guardOperator: '<',
          guardExpression: HIR_INT(20),
        },
        generalInductionVariables: [
          {
            name: 'j',
            loopValueCollector: 'tmp_j',
            initialValue: HIR_VARIABLE('j_init', HIR_INT_TYPE),
            incrementAmount: HIR_VARIABLE('outside', HIR_INT_TYPE),
          },
        ],
        derivedInductionLoopVariables: [],
        otherDerivedInductionVariables: [],
        otherLoopVariables: [],
        statements: [],
        breakCollector: { name: 'bc', type: HIR_INT_TYPE, value: HIR_VARIABLE('aa', HIR_INT_TYPE) },
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual([
    HIR_BINARY({
      name: 'bc',
      operator: '+',
      e1: HIR_VARIABLE('aa', HIR_INT_TYPE),
      e2: HIR_ZERO,
    }),
  ]);
});
