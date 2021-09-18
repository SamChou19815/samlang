import {
  HighIRFunction,
  debugPrintHighIRFunction,
  HIR_ZERO,
  HIR_ONE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_FUNCTION_TYPE,
  HIR_INT_TYPE,
} from 'samlang-core-ast/hir-nodes';
import { checkNotNull } from 'samlang-core-utils';

import optimizeHighIRFunctionByTailRecursionRewrite from '../hir-tail-recursion-optimization';

const assertOptimizationFails = (highIRFunction: HighIRFunction): void =>
  expect(optimizeHighIRFunctionByTailRecursionRewrite(highIRFunction)).toBeNull();

const assertOptimizationSucceed = (highIRFunction: HighIRFunction, expected: string): void =>
  expect(
    debugPrintHighIRFunction(
      checkNotNull(optimizeHighIRFunctionByTailRecursionRewrite(highIRFunction))
    )
  ).toBe(expected);

describe('hir-tail-recursion-optimization', () => {
  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 1/n', () => {
    assertOptimizationFails({
      name: 'ff',
      typeParameters: [],
      parameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [],
      returnValue: HIR_NAME('', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 2/n', () => {
    assertOptimizationFails({
      name: 'ff',
      typeParameters: [],
      parameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [],
      returnValue: HIR_VARIABLE('', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 3/n', () => {
    assertOptimizationFails({
      name: 'ff',
      typeParameters: [],
      parameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [HIR_BINARY({ name: 'd', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO })],
      returnValue: HIR_VARIABLE('', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 4/n', () => {
    assertOptimizationFails({
      name: 'ff',
      parameters: [],
      typeParameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_VARIABLE('', HIR_INT_TYPE),
          functionArguments: [],
          returnType: HIR_INT_TYPE,
        }),
      ],
      returnValue: HIR_VARIABLE('', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 5/n', () => {
    assertOptimizationFails({
      name: 'ff',
      parameters: [],
      typeParameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('', HIR_INT_TYPE),
          functionArguments: [],
          returnType: HIR_INT_TYPE,
        }),
      ],
      returnValue: HIR_VARIABLE('', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 6/n', () => {
    assertOptimizationFails({
      name: 'ff',
      parameters: [],
      typeParameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [],
          s2: [],
          finalAssignments: [],
        }),
      ],
      returnValue: HIR_VARIABLE('', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 7/n', () => {
    assertOptimizationFails({
      name: 'ff',
      parameters: [],
      typeParameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [],
          s2: [],
          finalAssignments: [],
        }),
      ],
      returnValue: HIR_ZERO,
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite fails case 8/n', () => {
    assertOptimizationFails({
      name: 'ff',
      parameters: [],
      typeParameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('ff', HIR_INT_TYPE),
          functionArguments: [],
          returnType: HIR_INT_TYPE,
        }),
      ],
      returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
    });
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite simple infinite loop case 1', () => {
    assertOptimizationSucceed(
      {
        name: 'loopy',
        typeParameters: [],
        parameters: ['n'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_BINARY({
            name: 'a',
            operator: '+',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
            returnCollector: 'r',
          }),
        ],
        returnValue: HIR_VARIABLE('r', HIR_INT_TYPE),
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

  it('optimizeHighIRFunctionByTailRecursionRewrite simple infinite loop case 2', () => {
    assertOptimizationSucceed(
      {
        name: 'loopy',
        typeParameters: [],
        parameters: ['n'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_BINARY({
            name: 'a',
            operator: '+',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
          }),
        ],
        returnValue: HIR_ZERO,
      },
      `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  while (true) {
    let a: int = (n: int) + 0;
    n = (a: int);
  }
  return 0;
}
`
    );
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite simple if-else loop case 1/n', () => {
    assertOptimizationSucceed(
      {
        name: 'loopy',
        parameters: ['n'],
        typeParameters: [],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_BINARY({
            name: 'a',
            operator: '+',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
                returnType: HIR_INT_TYPE,
                returnCollector: 'r1',
              }),
            ],
            s2: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
                returnType: HIR_INT_TYPE,
                returnCollector: 'r2',
              }),
            ],
            finalAssignments: [
              {
                name: 'r',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('r1', HIR_INT_TYPE),
                branch2Value: HIR_VARIABLE('r2', HIR_INT_TYPE),
              },
            ],
          }),
        ],
        returnValue: HIR_VARIABLE('r', HIR_INT_TYPE),
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

  it('optimizeHighIRFunctionByTailRecursionRewrite simple if-else loop case 2/n', () => {
    assertOptimizationSucceed(
      {
        name: 'loopy',
        parameters: ['n'],
        typeParameters: [],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_BINARY({
            name: 'a',
            operator: '+',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
                returnType: HIR_INT_TYPE,
                returnCollector: 'r1',
              }),
            ],
            s2: [],
            finalAssignments: [
              {
                name: 'r',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('r1', HIR_INT_TYPE),
                branch2Value: HIR_ZERO,
              },
            ],
          }),
        ],
        returnValue: HIR_VARIABLE('r', HIR_INT_TYPE),
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

  it('optimizeHighIRFunctionByTailRecursionRewrite simple if-else loop case 3/n', () => {
    assertOptimizationSucceed(
      {
        name: 'loopy',
        parameters: ['n'],
        typeParameters: [],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_BINARY({
            name: 'a',
            operator: '+',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('loopy', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
                returnType: HIR_INT_TYPE,
              }),
            ],
            s2: [],
            finalAssignments: [],
          }),
        ],
        returnValue: HIR_ZERO,
      },
      `function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  while (true) {
    let a: int = (n: int) + 0;
    if !0 {
      undefined = 0;
      break;
    }
    n = (a: int);
  }
  return 0;
}
`
    );
  });

  it('optimizeHighIRFunctionByTailRecursionRewrite nested complex case', () => {
    assertOptimizationSucceed(
      {
        name: 'loopy',
        parameters: ['n'],
        typeParameters: [],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [],
            s2: [
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
            finalAssignments: [
              {
                name: 'v',
                type: HIR_INT_TYPE,
                branch1Value: HIR_ZERO,
                branch2Value: HIR_VARIABLE('nested_return', HIR_INT_TYPE),
              },
            ],
          }),
        ],
        returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
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
    let nn: int = (n: int) - 1;
    let r: int = 0 + 0;
    n = (nn: int);
  }
  return (v: int);
}
`
    );
  });
});
