import {
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_INDEX_ACCESS,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MidIRStatement,
  debugPrintMidIRFunction,
  MidIRFunction,
  MIR_BOOL_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import optimizeMidIRFunctionsByInlining, {
  estimateFunctionInlineCost_EXPOSED_FOR_TESTING,
} from '../mir-inline-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

it('estimateFunctionInlineCost test', () => {
  expect(
    estimateFunctionInlineCost_EXPOSED_FOR_TESTING({
      name: '',
      parameters: [],
      type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
      body: [
        MIR_INDEX_ACCESS({
          name: 'i0',
          type: MIR_INT_TYPE,
          pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
          index: 2,
        }),
        MIR_BINARY({
          name: 'b0',
          operator: '+',
          e1: MIR_VARIABLE('i1', MIR_INT_TYPE),
          e2: MIR_INT(3),
        }),
        MIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: MIR_INT_TYPE,
          expressionList: [
            MIR_VARIABLE('i1', MIR_INT_TYPE),
            MIR_VARIABLE('b1', MIR_INT_TYPE),
            MIR_VARIABLE('b3', MIR_INT_TYPE),
          ],
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('fff', MIR_INT_TYPE),
          functionArguments: [
            MIR_VARIABLE('i1', MIR_INT_TYPE),
            MIR_VARIABLE('b1', MIR_INT_TYPE),
            MIR_VARIABLE('b3', MIR_INT_TYPE),
          ],
          returnType: MIR_INT_TYPE,
        }),
        MIR_CAST({
          name: 'ss',
          type: MIR_INT_TYPE,
          assignedExpression: MIR_VARIABLE('b3', MIR_INT_TYPE),
        }),
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [
            MIR_BINARY({
              name: '',
              operator: '+',
              e1: MIR_VARIABLE('', MIR_INT_TYPE),
              e2: MIR_INT(3),
            }),
          ],
          s2: [
            MIR_BINARY({
              name: '',
              operator: '+',
              e1: MIR_VARIABLE('', MIR_INT_TYPE),
              e2: MIR_INT(3),
            }),
          ],
          finalAssignments: [],
        }),
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [],
          s2: [],
          finalAssignments: [
            {
              name: 'a',
              type: MIR_INT_TYPE,
              branch1Value: MIR_ZERO,
              branch2Value: MIR_ZERO,
            },
          ],
        }),
        MIR_SINGLE_IF({
          booleanExpression: MIR_ZERO,
          invertCondition: false,
          statements: [
            MIR_BINARY({
              name: '',
              operator: '+',
              e1: MIR_VARIABLE('', MIR_INT_TYPE),
              e2: MIR_INT(3),
            }),
          ],
        }),
        MIR_WHILE({
          loopVariables: [
            { name: '', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
          ],
          statements: [
            MIR_BINARY({
              name: '',
              operator: '+',
              e1: MIR_VARIABLE('', MIR_INT_TYPE),
              e2: MIR_INT(3),
            }),
          ],
        }),
      ],
      returnValue: MIR_VARIABLE('ss', MIR_INT_TYPE),
    })
  ).toBe(30);
});

const assertCorrectlyInlined = (functions: readonly MidIRFunction[], expected: string): void => {
  expect(
    optimizeMidIRFunctionsByInlining(functions, new OptimizationResourceAllocator())
      .map(debugPrintMidIRFunction)
      .join('\n')
  ).toBe(expected);
};

it('optimizeMidIRFunctionsByInlining empty test', () => {
  expect(optimizeMidIRFunctionsByInlining([], new OptimizationResourceAllocator()).length).toBe(0);
});

it('optimizeMidIRFunctionsByInlining abort test', () => {
  const bigStatement = MIR_WHILE({
    loopVariables: [{ name: '', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO }],
    statements: [
      MIR_INDEX_ACCESS({
        name: 'i0',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
        index: 2,
      }),
      MIR_BINARY({
        name: 'b0',
        operator: '+',
        e1: MIR_VARIABLE('i1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
      MIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: MIR_INT_TYPE,
        expressionList: [
          MIR_VARIABLE('i1', MIR_INT_TYPE),
          MIR_VARIABLE('b1', MIR_INT_TYPE),
          MIR_VARIABLE('b3', MIR_INT_TYPE),
        ],
      }),
      MIR_FUNCTION_CALL({
        functionExpression: MIR_NAME('fff', MIR_INT_TYPE),
        functionArguments: [
          MIR_VARIABLE('i1', MIR_INT_TYPE),
          MIR_VARIABLE('b1', MIR_INT_TYPE),
          MIR_VARIABLE('b3', MIR_INT_TYPE),
        ],
        returnType: MIR_INT_TYPE,
      }),
      MIR_CAST({
        name: 'ss',
        type: MIR_INT_TYPE,
        assignedExpression: MIR_VARIABLE('b3', MIR_INT_TYPE),
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [
          MIR_BINARY({
            name: '',
            operator: '+',
            e1: MIR_VARIABLE('', MIR_INT_TYPE),
            e2: MIR_INT(3),
          }),
        ],
        s2: [
          MIR_BINARY({
            name: '',
            operator: '+',
            e1: MIR_VARIABLE('', MIR_INT_TYPE),
            e2: MIR_INT(3),
          }),
        ],
        finalAssignments: [],
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [],
        s2: [],
        finalAssignments: [
          {
            name: 'a',
            type: MIR_INT_TYPE,
            branch1Value: MIR_ZERO,
            branch2Value: MIR_ZERO,
          },
        ],
      }),
      MIR_SINGLE_IF({
        booleanExpression: MIR_ZERO,
        invertCondition: false,
        statements: [
          MIR_BINARY({
            name: '',
            operator: '+',
            e1: MIR_VARIABLE('', MIR_INT_TYPE),
            e2: MIR_INT(3),
          }),
        ],
      }),
      MIR_BINARY({
        name: '',
        operator: '+',
        e1: MIR_VARIABLE('', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
  });

  const statements: MidIRStatement[] = [];
  for (let i = 0; i < 100; i += 1) {
    statements.push(bigStatement);
  }

  optimizeMidIRFunctionsByInlining(
    [
      {
        name: '',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: statements,
        returnValue: MIR_ZERO,
      },
    ],
    new OptimizationResourceAllocator()
  );

  optimizeMidIRFunctionsByInlining(
    [
      {
        name: 'loop',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('loop', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: '',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: statements,
        returnValue: MIR_ZERO,
      },
    ],
    new OptimizationResourceAllocator()
  );
});

it('optimizeFunctionsByInlining test 1', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'factorial',
        parameters: ['n', 'acc'],
        type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
        body: [
          MIR_BINARY({
            name: 'c',
            operator: '==',
            e1: MIR_VARIABLE('n', MIR_INT_TYPE),
            e2: MIR_ZERO,
          }),
          MIR_IF_ELSE({
            booleanExpression: MIR_VARIABLE('c', MIR_BOOL_TYPE),
            s1: [],
            s2: [
              MIR_BINARY({
                name: 'n1',
                operator: '-',
                e1: MIR_VARIABLE('n', MIR_INT_TYPE),
                e2: MIR_ONE,
              }),
              MIR_BINARY({
                name: 'acc1',
                operator: '*',
                e1: MIR_VARIABLE('n', MIR_INT_TYPE),
                e2: MIR_VARIABLE('acc', MIR_INT_TYPE),
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME(
                  'factorial',
                  MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE)
                ),
                functionArguments: [
                  MIR_VARIABLE('n1', MIR_INT_TYPE),
                  MIR_VARIABLE('acc1', MIR_INT_TYPE),
                ],
                returnType: MIR_INT_TYPE,
                returnCollector: 'v',
              }),
            ],
            finalAssignments: [
              {
                name: 'fa',
                type: MIR_INT_TYPE,
                branch1Value: MIR_VARIABLE('acc', MIR_INT_TYPE),
                branch2Value: MIR_VARIABLE('v', MIR_INT_TYPE),
              },
            ],
          }),
        ],
        returnValue: MIR_VARIABLE('fa', MIR_INT_TYPE),
      },
      {
        name: 'loop',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('loop', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'insanelyBigFunction',
        parameters: ['a'],
        type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bb', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(
              'moveMove',
              MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE)
            ),
            functionArguments: [MIR_VARIABLE('a', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
          ...Array.from(new Array(10).keys()).map(() =>
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME(
                'non-existing-function',
                MIR_FUNCTION_TYPE([], MIR_INT_TYPE)
              ),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
            })
          ),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'moveMove',
        parameters: ['a'],
        type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
        body: [
          MIR_CAST({
            name: 'b',
            type: MIR_INT_TYPE,
            assignedExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
          }),
          MIR_INDEX_ACCESS({
            name: 'c',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
            index: 0,
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'bb',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_IF_ELSE({
            booleanExpression: MIR_ZERO,
            s1: [
              MIR_CAST({
                name: 'b',
                type: MIR_INT_TYPE,
                assignedExpression: MIR_ZERO,
              }),
            ],
            s2: [
              MIR_CAST({
                name: 'c',
                type: MIR_INT_TYPE,
                assignedExpression: MIR_ZERO,
              }),
            ],
            finalAssignments: [],
          }),
        ],
        returnValue: MIR_ZERO,
      },
    ],
    `function factorial(n: int, acc: int): int {
  let c: bool = (n: int) == 0;
  let fa: int;
  if (c: bool) {
    fa = (acc: int);
  } else {
    let n1: int = (n: int) + -1;
    let acc1: int = (n: int) * (acc: int);
    let v: int = factorial((n1: int), (acc1: int));
    fa = (v: int);
  }
  return (fa: int);
}

function loop(): int {
  loop();
  return 0;
}

function insanelyBigFunction(a: int): int {
  let _inline_0_c: int = 0;
  let _inline_1_b: int = (a: int);
  let _inline_1_c: int = (a: int)[0];
  (a: int)();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  return 0;
}

function moveMove(a: int): int {
  let b: int = (a: int);
  let c: int = (a: int)[0];
  return 0;
}

function bb(): int {
  let c: int = 0;
  return 0;
}
`
  );
});

it('optimizeFunctionsByInlining test 2', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'fooBar',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_IF_ELSE({
            booleanExpression: MIR_VARIABLE('bar', MIR_INT_TYPE),
            s1: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            s2: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('fooBar', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
                functionArguments: [],
                returnType: MIR_INT_TYPE,
              }),
            ],
            finalAssignments: [],
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'main',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('fooBar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'v',
          }),
        ],
        returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
      },
    ],
    `function fooBar(): int {
  if (bar: int) {
    let a: int = 0;
  } else {
    fooBar();
  }
  return 0;
}

function main(): int {
  if (bar: int) {
    let _inline_0_a: int = 0;
  } else {
    if (bar: int) {
      let _inline_1_a: int = 0;
    } else {
      if (bar: int) {
        let _inline_2_a: int = 0;
      } else {
        if (bar: int) {
          let _inline_3_a: int = 0;
        } else {
          if (bar: int) {
            let _inline_4_a: int = 0;
          } else {
            fooBar();
          }
        }
      }
    }
  }
  return 0;
}
`
  );
});

it('optimizeFunctionsByInlining test 3', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'fooBar',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_IF_ELSE({
            booleanExpression: MIR_VARIABLE('bar', MIR_INT_TYPE),
            s1: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('fooBar', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
                functionArguments: [],
                returnType: MIR_INT_TYPE,
              }),
            ],
            s2: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            finalAssignments: [],
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'main',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('fooBar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'v',
          }),
        ],
        returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
      },
    ],
    `function fooBar(): int {
  if (bar: int) {
    fooBar();
  } else {
    let a: int = 0;
  }
  return 0;
}

function main(): int {
  if (bar: int) {
    if (bar: int) {
      if (bar: int) {
        if (bar: int) {
          if (bar: int) {
            fooBar();
          } else {
            let _inline_4_a: int = 0;
          }
        } else {
          let _inline_3_a: int = 0;
        }
      } else {
        let _inline_2_a: int = 0;
      }
    } else {
      let _inline_1_a: int = 0;
    }
  } else {
    let _inline_0_a: int = 0;
  }
  return 0;
}
`
  );
});

it('optimizeFunctionsByInlining test 4', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'fooBar',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_IF_ELSE({
            booleanExpression: MIR_VARIABLE('bar', MIR_INT_TYPE),
            s1: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('fooBar', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
                functionArguments: [],
                returnType: MIR_INT_TYPE,
              }),
            ],
            s2: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            finalAssignments: [
              {
                name: 'b',
                type: MIR_INT_TYPE,
                branch1Value: MIR_ZERO,
                branch2Value: MIR_VARIABLE('a', MIR_INT_TYPE),
              },
            ],
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'main',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('fooBar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'v',
          }),
        ],
        returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
      },
    ],
    `function fooBar(): int {
  let b: int;
  if (bar: int) {
    fooBar();
    b = 0;
  } else {
    let a: int = 0;
    b = (a: int);
  }
  return 0;
}

function main(): int {
  let _inline_0_b: int;
  if (bar: int) {
    let _inline_1_b: int;
    if (bar: int) {
      let _inline_2_b: int;
      if (bar: int) {
        let _inline_3_b: int;
        if (bar: int) {
          let _inline_4_b: int;
          if (bar: int) {
            fooBar();
            _inline_4_b = 0;
          } else {
            let _inline_4_a: int = 0;
            _inline_4_b = (_inline_4_a: int);
          }
          _inline_3_b = 0;
        } else {
          let _inline_3_a: int = 0;
          _inline_3_b = (_inline_3_a: int);
        }
        _inline_2_b = 0;
      } else {
        let _inline_2_a: int = 0;
        _inline_2_b = (_inline_2_a: int);
      }
      _inline_1_b = 0;
    } else {
      let _inline_1_a: int = 0;
      _inline_1_b = (_inline_1_a: int);
    }
    _inline_0_b = 0;
  } else {
    let _inline_0_a: int = 0;
    _inline_0_b = (_inline_0_a: int);
  }
  return 0;
}
`
  );
});

it('optimizeFunctionsByInlining test 5', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'fooBar',
        parameters: ['bar', 'baz'],
        type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
        body: [
          MIR_STRUCT_INITIALIZATION({
            structVariableName: 'ff',
            type: MIR_INT_TYPE,
            expressionList: [MIR_VARIABLE('bar', MIR_INT_TYPE), MIR_VARIABLE('baz', MIR_INT_TYPE)],
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'main',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(
              'fooBar',
              MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE)
            ),
            functionArguments: [MIR_ONE, MIR_ZERO],
            returnType: MIR_INT_TYPE,
          }),
        ],
        returnValue: MIR_ZERO,
      },
    ],
    `function fooBar(bar: int, baz: int): int {
  let ff: int = [(bar: int), (baz: int)];
  return 0;
}

function main(): int {
  let _inline_0_ff: int = [1, 0];
  return 0;
}
`
  );
});

it('optimizeFunctionsByInlining test 6', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'fooBar',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_WHILE({
            loopVariables: [
              {
                name: 'n',
                type: MIR_INT_TYPE,
                initialValue: MIR_INT(10),
                loopValue: MIR_VARIABLE('_tmp_n', MIR_INT_TYPE),
              },
            ],
            statements: [
              MIR_SINGLE_IF({
                booleanExpression: MIR_VARIABLE('n', MIR_BOOL_TYPE),
                invertCondition: false,
                statements: [MIR_BREAK(MIR_ZERO)],
              }),
            ],
            breakCollector: { name: 'v', type: MIR_INT_TYPE },
          }),
        ],
        returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
      },
    ],
    `function fooBar(): int {
  return 0;
}
`
  );
});

it('optimizeFunctionsByInlining test 7', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'fooBar',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_WHILE({
            loopVariables: [
              {
                name: 'n',
                type: MIR_INT_TYPE,
                initialValue: MIR_INT(10),
                loopValue: MIR_VARIABLE('_tmp_n', MIR_INT_TYPE),
              },
            ],
            statements: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('fooBar', MIR_INT_TYPE),
                functionArguments: [],
                returnType: MIR_INT_TYPE,
                returnCollector: '_tmp_n',
              }),
            ],
          }),
        ],
        returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
      },
      {
        name: 'main',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('fooBar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'v',
          }),
        ],
        returnValue: MIR_VARIABLE('v', MIR_INT_TYPE),
      },
    ],
    `function fooBar(): int {
  let n: int = 10;
  while (true) {
    let _tmp_n: int = fooBar();
    n = (_tmp_n: int);
  }
  return (v: int);
}

function main(): int {
  let _inline_0_n: int = 10;
  while (true) {
    let _inline_1_n: int = 10;
    while (true) {
      let _inline_2_n: int = 10;
      while (true) {
        let _inline_3_n: int = 10;
        while (true) {
          let _inline_4_n: int = 10;
          while (true) {
            let _inline_4__tmp_n: int = fooBar();
            _inline_4_n = (_inline_4__tmp_n: int);
          }
          _inline_3_n = (v: int);
        }
        _inline_2_n = (v: int);
      }
      _inline_1_n = (v: int);
    }
    _inline_0_n = (v: int);
  }
  return (v: int);
}
`
  );
});
