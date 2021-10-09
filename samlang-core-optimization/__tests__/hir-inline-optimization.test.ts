import {
  HighIRStatement,
  HighIRFunction,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_STRUCT_INITIALIZATION,
  HIR_CLOSURE_INITIALIZATION,
  debugPrintHighIRFunction,
} from 'samlang-core/ast/hir-nodes';

import optimizeHighIRFunctionsByInlining, {
  estimateFunctionInlineCost_EXPOSED_FOR_TESTING,
} from '../hir-inline-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

describe('hir-inline-optimization', () => {
  it('estimateFunctionInlineCost test', () => {
    expect(
      estimateFunctionInlineCost_EXPOSED_FOR_TESTING({
        name: '',
        parameters: [],
        typeParameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_INDEX_ACCESS({
            name: 'i0',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            index: 2,
          }),
          HIR_BINARY({
            name: 'b0',
            operator: '+',
            e1: HIR_VARIABLE('i1', HIR_INT_TYPE),
            e2: HIR_INT(3),
          }),
          HIR_STRUCT_INITIALIZATION({
            structVariableName: 's',
            type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
            expressionList: [
              HIR_VARIABLE('i1', HIR_INT_TYPE),
              HIR_VARIABLE('b1', HIR_INT_TYPE),
              HIR_VARIABLE('b3', HIR_INT_TYPE),
            ],
          }),
          HIR_CLOSURE_INITIALIZATION({
            closureVariableName: 'v',
            closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
            functionName: 'f',
            functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            context: HIR_ZERO,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
            functionArguments: [
              HIR_VARIABLE('i1', HIR_INT_TYPE),
              HIR_VARIABLE('b1', HIR_INT_TYPE),
              HIR_VARIABLE('b3', HIR_INT_TYPE),
            ],
            returnType: HIR_INT_TYPE,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [
              HIR_BINARY({
                name: '',
                operator: '+',
                e1: HIR_VARIABLE('', HIR_INT_TYPE),
                e2: HIR_INT(3),
              }),
            ],
            s2: [
              HIR_BINARY({
                name: '',
                operator: '+',
                e1: HIR_VARIABLE('', HIR_INT_TYPE),
                e2: HIR_INT(3),
              }),
            ],
            finalAssignments: [],
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [],
            s2: [],
            finalAssignments: [
              {
                name: 'a',
                type: HIR_INT_TYPE,
                branch1Value: HIR_ZERO,
                branch2Value: HIR_ZERO,
              },
            ],
          }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: false,
            statements: [
              HIR_BINARY({
                name: '',
                operator: '+',
                e1: HIR_VARIABLE('', HIR_INT_TYPE),
                e2: HIR_INT(3),
              }),
            ],
          }),
          HIR_WHILE({
            loopVariables: [
              { name: '', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
            ],
            statements: [
              HIR_BINARY({
                name: '',
                operator: '+',
                e1: HIR_VARIABLE('', HIR_INT_TYPE),
                e2: HIR_INT(3),
              }),
            ],
          }),
        ],
        returnValue: HIR_VARIABLE('ss', HIR_INT_TYPE),
      })
    ).toBe(32);
  });

  const assertCorrectlyInlined = (functions: readonly HighIRFunction[], expected: string): void => {
    expect(
      optimizeHighIRFunctionsByInlining(functions, new OptimizationResourceAllocator())
        .map(debugPrintHighIRFunction)
        .join('\n')
    ).toBe(expected);
  };

  it('optimizeHighIRFunctionsByInlining empty test', () => {
    expect(optimizeHighIRFunctionsByInlining([], new OptimizationResourceAllocator()).length).toBe(
      0
    );
  });

  it('optimizeHighIRFunctionsByInlining abort test', () => {
    const bigStatement = HIR_WHILE({
      loopVariables: [
        { name: '', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
      ],
      statements: [
        HIR_INDEX_ACCESS({
          name: 'i0',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
          index: 2,
        }),
        HIR_BINARY({
          name: 'b0',
          operator: '+',
          e1: HIR_VARIABLE('i1', HIR_INT_TYPE),
          e2: HIR_INT(3),
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('SS'),
          expressionList: [
            HIR_VARIABLE('i1', HIR_INT_TYPE),
            HIR_VARIABLE('b1', HIR_INT_TYPE),
            HIR_VARIABLE('b3', HIR_INT_TYPE),
          ],
        }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
          functionArguments: [
            HIR_VARIABLE('i1', HIR_INT_TYPE),
            HIR_VARIABLE('b1', HIR_INT_TYPE),
            HIR_VARIABLE('b3', HIR_INT_TYPE),
          ],
          returnType: HIR_INT_TYPE,
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [
            HIR_BINARY({
              name: '',
              operator: '+',
              e1: HIR_VARIABLE('', HIR_INT_TYPE),
              e2: HIR_INT(3),
            }),
          ],
          s2: [
            HIR_BINARY({
              name: '',
              operator: '+',
              e1: HIR_VARIABLE('', HIR_INT_TYPE),
              e2: HIR_INT(3),
            }),
          ],
          finalAssignments: [],
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [],
          s2: [],
          finalAssignments: [
            {
              name: 'a',
              type: HIR_INT_TYPE,
              branch1Value: HIR_ZERO,
              branch2Value: HIR_ZERO,
            },
          ],
        }),
        HIR_SINGLE_IF({
          booleanExpression: HIR_ZERO,
          invertCondition: false,
          statements: [
            HIR_BINARY({
              name: '',
              operator: '+',
              e1: HIR_VARIABLE('', HIR_INT_TYPE),
              e2: HIR_INT(3),
            }),
          ],
        }),
        HIR_BINARY({
          name: '',
          operator: '+',
          e1: HIR_VARIABLE('', HIR_INT_TYPE),
          e2: HIR_INT(3),
        }),
      ],
    });

    const statements: HighIRStatement[] = [];
    for (let i = 0; i < 100; i += 1) {
      statements.push(bigStatement);
    }

    optimizeHighIRFunctionsByInlining(
      [
        {
          name: '',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: statements,
          returnValue: HIR_ZERO,
        },
      ],
      new OptimizationResourceAllocator()
    );

    optimizeHighIRFunctionsByInlining(
      [
        {
          name: 'loop',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('loop', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: '',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: statements,
          returnValue: HIR_ZERO,
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
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_BINARY({
              name: 'c',
              operator: '==',
              e1: HIR_VARIABLE('n', HIR_INT_TYPE),
              e2: HIR_ZERO,
            }),
            HIR_IF_ELSE({
              booleanExpression: HIR_VARIABLE('c', HIR_BOOL_TYPE),
              s1: [],
              s2: [
                HIR_BINARY({
                  name: 'n1',
                  operator: '-',
                  e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                  e2: HIR_ONE,
                }),
                HIR_BINARY({
                  name: 'acc1',
                  operator: '*',
                  e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                  e2: HIR_VARIABLE('acc', HIR_INT_TYPE),
                }),
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME(
                    'factorial',
                    HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE)
                  ),
                  functionArguments: [
                    HIR_VARIABLE('n1', HIR_INT_TYPE),
                    HIR_VARIABLE('acc1', HIR_INT_TYPE),
                  ],
                  returnType: HIR_INT_TYPE,
                  returnCollector: 'v',
                }),
              ],
              finalAssignments: [
                {
                  name: 'fa',
                  type: HIR_INT_TYPE,
                  branch1Value: HIR_VARIABLE('acc', HIR_INT_TYPE),
                  branch2Value: HIR_VARIABLE('v', HIR_INT_TYPE),
                },
              ],
            }),
          ],
          returnValue: HIR_VARIABLE('fa', HIR_INT_TYPE),
        },
        {
          name: 'loop',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          typeParameters: [],
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('loop', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'insanelyBigFunction',
          parameters: ['a'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
          typeParameters: [],
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('bb', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME(
                'moveMove',
                HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
              ),
              functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
            ...Array.from(new Array(10).keys()).map(() =>
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME(
                  'non-existing-function',
                  HIR_FUNCTION_TYPE([], HIR_INT_TYPE)
                ),
                functionArguments: [],
                returnType: HIR_INT_TYPE,
              })
            ),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'moveMove',
          parameters: ['a'],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_INDEX_ACCESS({
              name: 'c',
              type: HIR_INT_TYPE,
              pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
              index: 0,
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'bb',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ZERO,
              s1: [
                HIR_INDEX_ACCESS({
                  name: 'c',
                  type: HIR_INT_TYPE,
                  pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
                  index: 0,
                }),
              ],
              s2: [
                HIR_INDEX_ACCESS({
                  name: 'c',
                  type: HIR_INT_TYPE,
                  pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
                  index: 0,
                }),
              ],
              finalAssignments: [],
            }),
          ],
          returnValue: HIR_ZERO,
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
  let _inline_0_c: int = (a: int)[0];
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
  let c: int = (a: int)[0];
  return 0;
}

function bb(): int {
  let c: int = (a: int)[0];
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
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          typeParameters: [],
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_VARIABLE('bar', HIR_INT_TYPE),
              s1: [],
              s2: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                  functionArguments: [],
                  returnType: HIR_INT_TYPE,
                }),
              ],
              finalAssignments: [],
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          typeParameters: [],
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('fooBar', HIR_INT_TYPE),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'v',
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
        },
      ],
      `function fooBar(): int {
  if (bar: int) {
  } else {
    fooBar();
  }
  return 0;
}

function main(): int {
  if (bar: int) {
  } else {
    if (bar: int) {
    } else {
      if (bar: int) {
      } else {
        if (bar: int) {
        } else {
          if (bar: int) {
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
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          typeParameters: [],
          body: [
            HIR_SINGLE_IF({
              booleanExpression: HIR_VARIABLE('bar', HIR_INT_TYPE),
              invertCondition: false,
              statements: [
                HIR_BINARY({ name: 'vvv', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO }),
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                  functionArguments: [],
                  returnType: HIR_INT_TYPE,
                }),
              ],
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('fooBar', HIR_INT_TYPE),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'v',
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
        },
      ],
      `function fooBar(): int {
  if (bar: int) {
    fooBar();
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

  it('optimizeFunctionsByInlining test 4', () => {
    assertCorrectlyInlined(
      [
        {
          name: 'fooBar',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_VARIABLE('bar', HIR_INT_TYPE),
              s1: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                  functionArguments: [],
                  returnType: HIR_INT_TYPE,
                }),
              ],
              s2: [],
              finalAssignments: [
                {
                  name: 'b',
                  type: HIR_INT_TYPE,
                  branch1Value: HIR_ZERO,
                  branch2Value: HIR_VARIABLE('a', HIR_INT_TYPE),
                },
              ],
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('fooBar', HIR_INT_TYPE),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'v',
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
        },
      ],
      `function fooBar(): int {
  let b: int;
  if (bar: int) {
    fooBar();
    b = 0;
  } else {
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
            _inline_4_b = (a: int);
          }
          _inline_3_b = 0;
        } else {
          _inline_3_b = (a: int);
        }
        _inline_2_b = 0;
      } else {
        _inline_2_b = (a: int);
      }
      _inline_1_b = 0;
    } else {
      _inline_1_b = (a: int);
    }
    _inline_0_b = 0;
  } else {
    _inline_0_b = (a: int);
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
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName: 'ff',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('FF'),
              expressionList: [
                HIR_VARIABLE('bar', HIR_INT_TYPE),
                HIR_VARIABLE('baz', HIR_INT_TYPE),
              ],
            }),
            HIR_CLOSURE_INITIALIZATION({
              closureVariableName: 's',
              closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('SS'),
              functionName: 'aaa',
              functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
              context: HIR_ZERO,
            }),
            HIR_BREAK(HIR_ZERO),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME(
                'fooBar',
                HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE)
              ),
              functionArguments: [HIR_ONE, HIR_ZERO],
              returnType: HIR_INT_TYPE,
            }),
          ],
          returnValue: HIR_ZERO,
        },
      ],
      `function fooBar(bar: int, baz: int): int {
  let ff: FF = [(bar: int), (baz: int)];
  let s: SS = Closure { fun: (aaa: () -> int), context: 0 };
  undefined = 0;
  break;
  return 0;
}

function main(): int {
  let _inline_0_ff: FF = [1, 0];
  let _inline_0_s: SS = Closure { fun: (aaa: () -> int), context: 0 };
  undefined = 0;
  break;
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
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_WHILE({
              loopVariables: [
                {
                  name: 'n',
                  type: HIR_INT_TYPE,
                  initialValue: HIR_INT(10),
                  loopValue: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
                },
              ],
              statements: [
                HIR_SINGLE_IF({
                  booleanExpression: HIR_VARIABLE('n', HIR_BOOL_TYPE),
                  invertCondition: false,
                  statements: [HIR_BREAK(HIR_ZERO)],
                }),
              ],
              breakCollector: { name: 'v', type: HIR_INT_TYPE },
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
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
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_WHILE({
              loopVariables: [
                {
                  name: 'n',
                  type: HIR_INT_TYPE,
                  initialValue: HIR_INT(10),
                  loopValue: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
                },
              ],
              statements: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('fooBar', HIR_INT_TYPE),
                  functionArguments: [],
                  returnType: HIR_INT_TYPE,
                  returnCollector: '_tmp_n',
                }),
              ],
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
        },
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('fooBar', HIR_INT_TYPE),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'v',
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
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

  it('optimizeFunctionsByInlining test 7', () => {
    assertCorrectlyInlined(
      [
        {
          name: 'fooBar',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_WHILE({
              loopVariables: [],
              statements: [HIR_BREAK(HIR_ZERO)],
              breakCollector: { name: 'v', type: HIR_INT_TYPE },
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
        },
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('fooBar', HIR_INT_TYPE),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'v',
            }),
          ],
          returnValue: HIR_VARIABLE('v', HIR_INT_TYPE),
        },
      ],
      `function fooBar(): int {
  return 0;
}

function main(): int {
  return 0;
}
`
    );
  });
});
