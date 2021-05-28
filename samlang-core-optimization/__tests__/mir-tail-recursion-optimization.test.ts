import optimizeMidIRFunctionByTailRecursionRewrite from '../mir-tail-recursion-optimization';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_CAST,
  debugPrintMidIRFunction,
  MidIRFunction,
  MIR_FUNCTION_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const assertOptimizationFails = (midIRFunction: MidIRFunction): void =>
  expect(optimizeMidIRFunctionByTailRecursionRewrite(midIRFunction)).toBeNull();

const assertOptimizationSucceed = (midIRFunction: MidIRFunction, expected: string): void =>
  expect(
    debugPrintMidIRFunction(
      checkNotNull(optimizeMidIRFunctionByTailRecursionRewrite(midIRFunction))
    )
  ).toBe(expected);

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 1/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [],
    returnValue: MIR_NAME('', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 2/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [],
    returnValue: MIR_VARIABLE('', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 3/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [MIR_CAST({ name: 'd', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
    returnValue: MIR_VARIABLE('', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 4/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [
      MIR_FUNCTION_CALL({
        functionExpression: MIR_VARIABLE('', MIR_INT_TYPE),
        functionArguments: [],
        returnType: MIR_INT_TYPE,
      }),
    ],
    returnValue: MIR_VARIABLE('', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 5/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [
      MIR_FUNCTION_CALL({
        functionExpression: MIR_NAME('', MIR_INT_TYPE),
        functionArguments: [],
        returnType: MIR_INT_TYPE,
      }),
    ],
    returnValue: MIR_VARIABLE('', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 6/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [],
        s2: [],
        finalAssignments: [],
      }),
    ],
    returnValue: MIR_VARIABLE('', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 7/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [],
        s2: [],
        finalAssignments: [],
      }),
    ],
    returnValue: MIR_ZERO,
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite fails case 8/n', () => {
  assertOptimizationFails({
    name: 'ff',
    parameters: [],
    type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
    body: [
      MIR_FUNCTION_CALL({
        functionExpression: MIR_NAME('ff', MIR_INT_TYPE),
        functionArguments: [],
        returnType: MIR_INT_TYPE,
      }),
    ],
    returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
  });
});

it('optimizeMidIRFunctionByTailRecursionRewrite simple infinite loop case', () => {
  assertOptimizationSucceed(
    {
      name: 'loopy',
      parameters: ['n'],
      type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
      body: [
        MIR_BINARY({ name: 'a', operator: '+', e1: MIR_VARIABLE('n', MIR_INT_TYPE), e2: MIR_ZERO }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('loopy', MIR_INT_TYPE),
          functionArguments: [MIR_VARIABLE('a', MIR_INT_TYPE)],
          returnType: MIR_INT_TYPE,
          returnCollector: 'r',
        }),
      ],
      returnValue: MIR_VARIABLE('r', MIR_INT_TYPE),
    },
    `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a: int = (n: int) + 0;
    let r: int = 0 + 0;
    n = (a: int);
  }
  return (r: int);
}
`
  );
});

it('optimizeMidIRFunctionByTailRecursionRewrite simple if-else loop case 1/n', () => {
  assertOptimizationSucceed(
    {
      name: 'loopy',
      parameters: ['n'],
      type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
      body: [
        MIR_BINARY({ name: 'a', operator: '+', e1: MIR_VARIABLE('n', MIR_INT_TYPE), e2: MIR_ZERO }),
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('loopy', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('a', MIR_INT_TYPE)],
              returnType: MIR_INT_TYPE,
              returnCollector: 'r1',
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('loopy', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('a', MIR_INT_TYPE)],
              returnType: MIR_INT_TYPE,
              returnCollector: 'r2',
            }),
          ],
          finalAssignments: [
            {
              name: 'r',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('r1', MIR_INT_TYPE),
              branch2Value: MIR_VARIABLE('r2', MIR_INT_TYPE),
            },
          ],
        }),
      ],
      returnValue: MIR_VARIABLE('r', MIR_INT_TYPE),
    },
    `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a: int = (n: int) + 0;
    let _tailrec_0_: int;
    if 0 {
      let r1: int = 0 + 0;
      _tailrec_0_ = (a: int);
    } else {
      let r2: int = 0 + 0;
      _tailrec_0_ = (a: int);
    }
    n = (_tailrec_0_: int);
  }
  return (r: int);
}
`
  );
});

it('optimizeMidIRFunctionByTailRecursionRewrite simple if-else loop case 2/n', () => {
  assertOptimizationSucceed(
    {
      name: 'loopy',
      parameters: ['n'],
      type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
      body: [
        MIR_BINARY({ name: 'a', operator: '+', e1: MIR_VARIABLE('n', MIR_INT_TYPE), e2: MIR_ZERO }),
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('loopy', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('a', MIR_INT_TYPE)],
              returnType: MIR_INT_TYPE,
              returnCollector: 'r1',
            }),
          ],
          s2: [],
          finalAssignments: [
            {
              name: 'r',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('r1', MIR_INT_TYPE),
              branch2Value: MIR_ZERO,
            },
          ],
        }),
      ],
      returnValue: MIR_VARIABLE('r', MIR_INT_TYPE),
    },
    `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a: int = (n: int) + 0;
    if !0 {
      r = 0;
      break;
    }
    let r1: int = 0 + 0;
    n = (a: int);
  }
  return (r: int);
}
`
  );
});

it('optimizeMidIRFunctionByTailRecursionRewrite nested complex case', () => {
  assertOptimizationSucceed(
    {
      name: 'loopy',
      parameters: ['n'],
      type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
      body: [
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [],
          s2: [
            MIR_IF_ELSE({
              booleanExpression: MIR_ZERO,
              s1: [],
              s2: [
                MIR_BINARY({
                  name: 'nn',
                  operator: '-',
                  e1: MIR_VARIABLE('n', MIR_INT_TYPE),
                  e2: MIR_ONE,
                }),
                MIR_FUNCTION_CALL({
                  functionExpression: MIR_NAME('loopy', MIR_INT_TYPE),
                  functionArguments: [MIR_VARIABLE('nn', MIR_INT_TYPE)],
                  returnType: MIR_INT_TYPE,
                  returnCollector: 'r',
                }),
              ],
              finalAssignments: [
                {
                  name: 'nested_return',
                  type: MIR_INT_TYPE,
                  branch1Value: MIR_ONE,
                  branch2Value: MIR_VARIABLE('r', MIR_INT_TYPE),
                },
              ],
            }),
          ],
          finalAssignments: [
            {
              name: 'v',
              type: MIR_INT_TYPE,
              branch1Value: MIR_ZERO,
              branch2Value: MIR_VARIABLE('nested_return', MIR_INT_TYPE),
            },
          ],
        }),
      ],
      returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
    },
    `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let v: int;
  while (true) {
    if 0 {
      v = 0;
      break;
    }
    if 0 {
      v = 1;
      break;
    }
    let nn: int = (n: int) + -1;
    let r: int = 0 + 0;
    n = (nn: int);
  }
  return (v: int);
}
`
  );
});
