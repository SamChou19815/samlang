import highIRLoopStrengthReductionOptimization from '../hir-loop-strength-reduction';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('highIRLoopStrengthReductionOptimization works', () => {
  expect(
    highIRLoopStrengthReductionOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: HIR_ONE,
          incrementAmount: HIR_ONE,
          guardOperator: '<',
          guardExpression: HIR_INT(10),
        },
        generalInductionVariables: [
          { name: 'j', initialValue: HIR_ONE, incrementAmount: HIR_VARIABLE('c', HIR_INT_TYPE) },
        ],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [
          {
            name: 'x',
            baseName: 'i',
            multiplier: HIR_VARIABLE('a', HIR_INT_TYPE),
            immediate: HIR_VARIABLE('b', HIR_INT_TYPE),
          },
          {
            name: 'y',
            baseName: 'j',
            multiplier: HIR_VARIABLE('a', HIR_INT_TYPE),
            immediate: HIR_VARIABLE('b', HIR_INT_TYPE),
          },
        ],
        statements: [],
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual({
    prefixStatements: [
      HIR_BINARY({
        name: '_loop_0',
        operator: '*',
        e1: HIR_VARIABLE('a', HIR_INT_TYPE),
        e2: HIR_ONE,
      }),
      HIR_BINARY({
        name: '_loop_1',
        operator: '+',
        e1: HIR_VARIABLE('b', HIR_INT_TYPE),
        e2: HIR_VARIABLE('_loop_0', HIR_INT_TYPE),
      }),
    ],
    optimizableWhileLoop: {
      basicInductionVariableWithLoopGuard: {
        name: 'i',
        initialValue: HIR_ONE,
        incrementAmount: HIR_ONE,
        guardOperator: '<',
        guardExpression: HIR_INT(10),
      },
      generalInductionVariables: [
        { name: 'j', initialValue: HIR_ONE, incrementAmount: HIR_VARIABLE('c', HIR_INT_TYPE) },
        {
          name: 'x',
          initialValue: HIR_VARIABLE('_loop_1', HIR_INT_TYPE),
          incrementAmount: HIR_VARIABLE('a', HIR_INT_TYPE),
        },
      ],
      loopVariablesThatAreNotBasicInductionVariables: [],
      derivedInductionVariables: [
        {
          name: 'y',
          baseName: 'j',
          multiplier: HIR_VARIABLE('a', HIR_INT_TYPE),
          immediate: HIR_VARIABLE('b', HIR_INT_TYPE),
        },
      ],
      statements: [],
    },
  });
});
