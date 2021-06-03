import {
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import midIRLoopStrengthReductionOptimization from '../mir-loop-strength-reduction';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

it('midIRLoopStrengthReductionOptimization works', () => {
  expect(
    midIRLoopStrengthReductionOptimization(
      {
        basicInductionVariableWithLoopGuard: {
          name: 'i',
          initialValue: MIR_ONE,
          incrementAmount: MIR_ONE,
          guardOperator: '<',
          guardExpression: MIR_INT(10),
        },
        generalInductionVariables: [
          { name: 'j', initialValue: MIR_ONE, incrementAmount: MIR_VARIABLE('c', MIR_INT_TYPE) },
        ],
        loopVariablesThatAreNotBasicInductionVariables: [],
        derivedInductionVariables: [
          {
            name: 'x',
            baseName: 'i',
            multiplier: MIR_VARIABLE('a', MIR_INT_TYPE),
            immediate: MIR_VARIABLE('b', MIR_INT_TYPE),
          },
          {
            name: 'y',
            baseName: 'j',
            multiplier: MIR_VARIABLE('a', MIR_INT_TYPE),
            immediate: MIR_VARIABLE('b', MIR_INT_TYPE),
          },
        ],
        statements: [],
      },
      new OptimizationResourceAllocator()
    )
  ).toEqual({
    prefixStatements: [
      MIR_BINARY({
        name: '_loop_0',
        operator: '*',
        e1: MIR_VARIABLE('a', MIR_INT_TYPE),
        e2: MIR_ONE,
      }),
      MIR_BINARY({
        name: '_loop_1',
        operator: '+',
        e1: MIR_VARIABLE('b', MIR_INT_TYPE),
        e2: MIR_VARIABLE('_loop_0', MIR_INT_TYPE),
      }),
    ],
    optimizableWhileLoop: {
      basicInductionVariableWithLoopGuard: {
        name: 'i',
        initialValue: MIR_ONE,
        incrementAmount: MIR_ONE,
        guardOperator: '<',
        guardExpression: MIR_INT(10),
      },
      generalInductionVariables: [
        { name: 'j', initialValue: MIR_ONE, incrementAmount: MIR_VARIABLE('c', MIR_INT_TYPE) },
        {
          name: 'x',
          initialValue: MIR_VARIABLE('_loop_1', MIR_INT_TYPE),
          incrementAmount: MIR_VARIABLE('a', MIR_INT_TYPE),
        },
      ],
      loopVariablesThatAreNotBasicInductionVariables: [],
      derivedInductionVariables: [
        {
          name: 'y',
          baseName: 'j',
          multiplier: MIR_VARIABLE('a', MIR_INT_TYPE),
          immediate: MIR_VARIABLE('b', MIR_INT_TYPE),
        },
      ],
      statements: [],
    },
  });
});
