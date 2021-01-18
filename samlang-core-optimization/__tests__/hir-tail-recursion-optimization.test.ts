import optimizeHighIRFunctionByTailRecursionRewrite from '../hir-tail-recursion-optimization';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_CAST,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { debugPrintHighIRFunction, HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { HIR_FUNCTION_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import { checkNotNull } from 'samlang-core-utils';

const assertOptimizationFails = (highIRFunction: HighIRFunction): void =>
  expect(optimizeHighIRFunctionByTailRecursionRewrite(highIRFunction)).toBeNull();

const assertOptimizationSucceed = (highIRFunction: HighIRFunction, expected: string): void =>
  expect(
    debugPrintHighIRFunction(
      checkNotNull(optimizeHighIRFunctionByTailRecursionRewrite(highIRFunction))
    )
  ).toBe(expected);

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 1/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [HIR_RETURN(HIR_NAME('', HIR_INT_TYPE))],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 2/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [HIR_RETURN(HIR_VARIABLE('', HIR_INT_TYPE))],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 3/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_CAST({ name: 'd', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
      HIR_RETURN(HIR_VARIABLE('', HIR_INT_TYPE)),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 4/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_VARIABLE('', HIR_INT_TYPE),
        functionArguments: [],
        returnType: HIR_INT_TYPE,
      }),
      HIR_RETURN(HIR_VARIABLE('', HIR_INT_TYPE)),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 5/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('', HIR_INT_TYPE),
        functionArguments: [],
        returnType: HIR_INT_TYPE,
      }),
      HIR_RETURN(HIR_VARIABLE('', HIR_INT_TYPE)),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 6/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_IF_ELSE({ booleanExpression: HIR_ZERO, s1: [], s2: [], finalAssignments: [] }),
      HIR_RETURN(HIR_VARIABLE('', HIR_INT_TYPE)),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 7/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_IF_ELSE({ booleanExpression: HIR_ZERO, s1: [], s2: [], finalAssignments: [] }),
      HIR_RETURN(HIR_ZERO),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 8/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_SWITCH({ caseVariable: 'd', cases: [], finalAssignments: [] }),
      HIR_RETURN(HIR_ZERO),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 9/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_SWITCH({ caseVariable: 'd', cases: [], finalAssignments: [] }),
      HIR_RETURN(HIR_VARIABLE('', HIR_INT_TYPE)),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite fails case 10/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('ff', HIR_INT_TYPE),
        functionArguments: [],
        returnType: HIR_INT_TYPE,
      }),
      HIR_RETURN(HIR_VARIABLE('v', HIR_INT_TYPE)),
    ],
  });
});

it('optimizeHighIRFunctionByTailRecursionRewrite simple infinite loop case', () => {
  assertOptimizationSucceed(
    {
      name: 'loopy',
      parameters: ['n'],
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_BINARY({ name: 'a', operator: '+', e1: HIR_VARIABLE('n', HIR_INT_TYPE), e2: HIR_ZERO }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
          functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
          returnType: HIR_INT_TYPE,
          returnCollector: 'r',
        }),
        HIR_RETURN(HIR_VARIABLE('r', HIR_INT_TYPE)),
      ],
    },
    `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let _tailrec_0_: int;
  do {
    let a: int = (n: int) + 0;
    let r: int = 0 + 0;
    n = (a: int);
    _tailrec_0_ = (r: int);
  } while (1);
  return (_tailrec_0_: int);
}
`
  );
});

it('optimizeHighIRFunctionByTailRecursionRewrite nested complex case', () => {
  assertOptimizationSucceed(
    {
      name: 'loopy',
      parameters: ['n'],
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_SWITCH({
          caseVariable: 'n',
          cases: [
            {
              caseNumber: 0,
              statements: [],
            },
            {
              caseNumber: 1,
              statements: [],
            },
            {
              caseNumber: 2,
              statements: [
                HIR_IF_ELSE({
                  booleanExpression: HIR_ZERO,
                  s1: [],
                  s2: [
                    HIR_BINARY({
                      name: 'nn',
                      operator: '-',
                      e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                      e2: HIR_ONE,
                    }),
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
                      functionArguments: [HIR_VARIABLE('nn', HIR_INT_TYPE)],
                      returnType: HIR_INT_TYPE,
                      returnCollector: 'r',
                    }),
                  ],
                  finalAssignments: [
                    {
                      name: 'nested_return',
                      type: HIR_INT_TYPE,
                      branch1Value: HIR_ONE,
                      branch2Value: HIR_VARIABLE('r', HIR_INT_TYPE),
                    },
                  ],
                }),
              ],
            },
          ],
          finalAssignments: [
            {
              name: 'v',
              type: HIR_INT_TYPE,
              branchValues: [HIR_ZERO, HIR_ONE, HIR_VARIABLE('nested_return', HIR_INT_TYPE)],
            },
          ],
        }),
        HIR_RETURN(HIR_VARIABLE('v', HIR_INT_TYPE)),
      ],
    },
    `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let _tailrec_4_: int;
  do {
    let v: int;
    let _tailrec_2_: int;
    let _tailrec_3_: bool;
    switch (n) {
      case 0: {
        v = 0;
        _tailrec_2_ = 0;
        _tailrec_3_ = 0;
      }
      case 1: {
        v = 1;
        _tailrec_2_ = 0;
        _tailrec_3_ = 0;
      }
      case 2: {
        let nested_return: int;
        let _tailrec_0_: int;
        let _tailrec_1_: bool;
        if 0 {
          nested_return = 1;
          _tailrec_0_ = 0;
          _tailrec_1_ = 0;
        } else {
          let nn: int = (n: int) + -1;
          let r: int = 0 + 0;
          nested_return = (r: int);
          _tailrec_0_ = (nn: int);
          _tailrec_1_ = 1;
        }
        v = (nested_return: int);
        _tailrec_2_ = (_tailrec_0_: int);
        _tailrec_3_ = (_tailrec_1_: bool);
      }
    }
    n = (_tailrec_2_: int);
    _tailrec_4_ = (v: int);
  } while ((_tailrec_3_: bool));
  return (_tailrec_4_: int);
}
`
  );
});
