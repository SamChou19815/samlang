import optimizeHighIRFunctionsByInlining, {
  estimateFunctionInlineCost_EXPOSED_FOR_TESTING,
} from '../hir-inline-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { debugPrintHighIRFunction, HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { HIR_BOOL_TYPE, HIR_FUNCTION_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('estimateFunctionInlineCost test', () => {
  expect(
    estimateFunctionInlineCost_EXPOSED_FOR_TESTING({
      name: '',
      parameters: [],
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
          type: HIR_INT_TYPE,
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
        }),
        HIR_CAST({
          name: 'ss',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_VARIABLE('b3', HIR_INT_TYPE),
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
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [],
          s2: [],
          finalAssignment: {
            name: 'a',
            type: HIR_INT_TYPE,
            branch1Value: HIR_ZERO,
            branch2Value: HIR_ZERO,
          },
        }),
        HIR_SWITCH({
          caseVariable: '',
          cases: [
            {
              caseNumber: 1,
              statements: [
                HIR_BINARY({
                  name: '',
                  operator: '+',
                  e1: HIR_VARIABLE('', HIR_INT_TYPE),
                  e2: HIR_INT(3),
                }),
              ],
            },
          ],
        }),
        HIR_SWITCH({
          caseVariable: '',
          cases: [
            {
              caseNumber: 1,
              statements: [
                HIR_BINARY({
                  name: '',
                  operator: '+',
                  e1: HIR_VARIABLE('', HIR_INT_TYPE),
                  e2: HIR_INT(3),
                }),
              ],
            },
          ],
          finalAssignment: { name: '', type: HIR_INT_TYPE, branchValues: [HIR_ZERO, HIR_ZERO] },
        }),
        HIR_RETURN(HIR_VARIABLE('ss', HIR_INT_TYPE)),
      ],
    })
  ).toBe(31);
});

const assertCorrectlyInlined = (functions: readonly HighIRFunction[], expected: string): void => {
  expect(
    optimizeHighIRFunctionsByInlining(functions, new OptimizationResourceAllocator())
      .map(debugPrintHighIRFunction)
      .join('\n')
  ).toBe(expected);
};

it('optimizeFunctionsByInlining test 1', () => {
  assertCorrectlyInlined(
    [
      {
        name: 'factorial',
        parameters: ['n', 'acc'],
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
                returnCollector: { name: 'v', type: HIR_INT_TYPE },
              }),
            ],
            finalAssignment: {
              name: 'fa',
              type: HIR_INT_TYPE,
              branch1Value: HIR_VARIABLE('acc', HIR_INT_TYPE),
              branch2Value: HIR_VARIABLE('v', HIR_INT_TYPE),
            },
          }),
          HIR_RETURN(HIR_VARIABLE('fa', HIR_INT_TYPE)),
        ],
      },
      {
        name: 'loop',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('loop', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
            functionArguments: [],
          }),
          HIR_RETURN(HIR_ZERO),
        ],
      },
      {
        name: 'insanelyBigFunction',
        parameters: ['a'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bb', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
            functionArguments: [],
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'moveMove',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE)],
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            functionArguments: [],
          }),
          ...Array.from(new Array(10).keys()).map(() =>
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME(
                'non-existing-function',
                HIR_FUNCTION_TYPE([], HIR_INT_TYPE)
              ),
              functionArguments: [],
            })
          ),
        ],
      },
      {
        name: 'moveMove',
        parameters: ['a'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_CAST({
            name: 'b',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
          }),
          HIR_INDEX_ACCESS({
            name: 'c',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            index: 0,
          }),
          HIR_RETURN(HIR_ZERO),
        ],
      },
      {
        name: 'bb',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [
              HIR_CAST({
                name: 'b',
                type: HIR_INT_TYPE,
                assignedExpression: HIR_ZERO,
              }),
            ],
            s2: [
              HIR_CAST({
                name: 'c',
                type: HIR_INT_TYPE,
                assignedExpression: HIR_ZERO,
              }),
            ],
          }),
        ],
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
    let _inline_0_c: bool = (n1: int) == 0;
    let _inline_0_fa: int;
    if (_inline_0_c: bool) {
      _inline_0_fa = (acc1: int);
    } else {
      let _inline_0_n1: int = (n1: int) + -1;
      let _inline_0_acc1: int = (n1: int) * (acc1: int);
      let _inline_4_c: bool = (_inline_0_n1: int) == 0;
      let _inline_4_fa: int;
      if (_inline_4_c: bool) {
        _inline_4_fa = (_inline_0_acc1: int);
      } else {
        let _inline_4_n1: int = (_inline_0_n1: int) + -1;
        let _inline_4_acc1: int = (_inline_0_n1: int) * (_inline_0_acc1: int);
        let _inline_4__inline_0_c: bool = (_inline_4_n1: int) == 0;
        let _inline_4__inline_0_fa: int;
        if (_inline_4__inline_0_c: bool) {
          _inline_4__inline_0_fa = (_inline_4_acc1: int);
        } else {
          let _inline_4__inline_0_n1: int = (_inline_4_n1: int) + -1;
          let _inline_4__inline_0_acc1: int = (_inline_4_n1: int) * (_inline_4_acc1: int);
          let _inline_4__inline_0_v: int = factorial((_inline_4__inline_0_n1: int), (_inline_4__inline_0_acc1: int));
          _inline_4__inline_0_fa = (_inline_4__inline_0_v: int);
        }
        _inline_4_fa = (_inline_4__inline_0_fa: int);
      }
      _inline_0_fa = (_inline_4_fa: int);
    }
    fa = (_inline_0_fa: int);
  }
  return (fa: int);
}

function loop(): int {
  loop();
  return 0;
}

function insanelyBigFunction(a: int): int {
  let _inline_2_c: int = 0;
  let _inline_3_b: int = (a: int);
  let _inline_3_c: int = (a: int)[0];
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
}

function moveMove(a: int): int {
  let b: int = (a: int);
  let c: int = (a: int)[0];
  return 0;
}

function bb(): int {
  let c: int = 0;
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
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('bar', HIR_INT_TYPE),
            s1: [HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
            s2: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                functionArguments: [],
              }),
            ],
          }),
        ],
      },
    ],
    `function fooBar(): int {
  if (bar: int) {
    let a: int = 0;
  } else {
    if (bar: int) {
      let _inline_0_a: int = 0;
    } else {
      if (bar: int) {
        let _inline_1_a: int = 0;
      } else {
        if (bar: int) {
          let _inline_1__inline_0_a: int = 0;
        } else {
          if (bar: int) {
            let _inline_2_a: int = 0;
          } else {
            if (bar: int) {
              let _inline_2__inline_0_a: int = 0;
            } else {
              if (bar: int) {
                let _inline_2__inline_1_a: int = 0;
              } else {
                if (bar: int) {
                  let _inline_2__inline_1__inline_0_a: int = 0;
                } else {
                  fooBar();
                }
              }
            }
          }
        }
      }
    }
  }
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
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('bar', HIR_INT_TYPE),
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                functionArguments: [],
              }),
            ],
            s2: [HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
          }),
        ],
      },
    ],
    `function fooBar(): int {
  if (bar: int) {
    if (bar: int) {
      if (bar: int) {
        if (bar: int) {
          if (bar: int) {
            if (bar: int) {
              if (bar: int) {
                if (bar: int) {
                  fooBar();
                } else {
                  let _inline_2__inline_1__inline_0_a: int = 0;
                }
              } else {
                let _inline_2__inline_1_a: int = 0;
              }
            } else {
              let _inline_2__inline_0_a: int = 0;
            }
          } else {
            let _inline_2_a: int = 0;
          }
        } else {
          let _inline_1__inline_0_a: int = 0;
        }
      } else {
        let _inline_1_a: int = 0;
      }
    } else {
      let _inline_0_a: int = 0;
    }
  } else {
    let a: int = 0;
  }
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
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('bar', HIR_INT_TYPE),
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                functionArguments: [],
              }),
            ],
            s2: [HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
            finalAssignment: {
              name: 'b',
              type: HIR_INT_TYPE,
              branch1Value: HIR_ZERO,
              branch2Value: HIR_VARIABLE('a', HIR_INT_TYPE),
            },
          }),
        ],
      },
    ],
    `function fooBar(): int {
  let b: int;
  if (bar: int) {
    let _inline_0_b: int;
    if (bar: int) {
      let _inline_1_b: int;
      if (bar: int) {
        let _inline_1__inline_0_b: int;
        if (bar: int) {
          fooBar();
          _inline_1__inline_0_b = 0;
        } else {
          let _inline_1__inline_0_a: int = 0;
          _inline_1__inline_0_b = (_inline_1__inline_0_a: int);
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
    b = 0;
  } else {
    let a: int = 0;
    b = (a: int);
  }
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
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_STRUCT_INITIALIZATION({
            structVariableName: 'ff',
            type: HIR_INT_TYPE,
            expressionList: [HIR_VARIABLE('bar', HIR_INT_TYPE), HIR_VARIABLE('baz', HIR_INT_TYPE)],
          }),
        ],
      },
      {
        name: 'main',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'fooBar',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_ONE, HIR_ZERO],
          }),
        ],
      },
    ],
    `function fooBar(bar: int, baz: int): int {
  let ff: int = [(bar: int), (baz: int)];
}

function main(): int {
  let _inline_0_ff: int = [1, 0];
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
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_SWITCH({
            caseVariable: 'cc',
            cases: [
              {
                caseNumber: 1,
                statements: [
                  HIR_FUNCTION_CALL({
                    functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                    functionArguments: [],
                  }),
                ],
              },
              {
                caseNumber: 1,
                statements: [
                  HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
                ],
              },
            ],
            finalAssignment: {
              name: 'b',
              type: HIR_INT_TYPE,
              branchValues: [HIR_ZERO, HIR_VARIABLE('a', HIR_INT_TYPE)],
            },
          }),
        ],
      },
    ],
    `function fooBar(): int {
  let b: int;
  switch (cc) {
    case 1: {
      let _inline_0_b: int;
      switch (cc) {
        case 1: {
          let _inline_1_b: int;
          switch (cc) {
            case 1: {
              let _inline_1__inline_0_b: int;
              switch (cc) {
                case 1: {
                  fooBar();
                  _inline_1__inline_0_b = 0;
                }
                case 1: {
                  let _inline_1__inline_0_a: int = 0;
                  _inline_1__inline_0_b = (_inline_1__inline_0_a: int);
                }
              }
              _inline_1_b = 0;
            }
            case 1: {
              let _inline_1_a: int = 0;
              _inline_1_b = (_inline_1_a: int);
            }
          }
          _inline_0_b = 0;
        }
        case 1: {
          let _inline_0_a: int = 0;
          _inline_0_b = (_inline_0_a: int);
        }
      }
      b = 0;
    }
    case 1: {
      let a: int = 0;
      b = (a: int);
    }
  }
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
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_SWITCH({
            caseVariable: 'cc',
            cases: [
              {
                caseNumber: 1,
                statements: [
                  HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
                ],
              },
              {
                caseNumber: 1,
                statements: [
                  HIR_FUNCTION_CALL({
                    functionExpression: HIR_NAME('fooBar', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                    functionArguments: [],
                  }),
                ],
              },
            ],
          }),
        ],
      },
    ],
    `function fooBar(): int {
  switch (cc) {
    case 1: {
      let a: int = 0;
    }
    case 1: {
      switch (cc) {
        case 1: {
          let _inline_0_a: int = 0;
        }
        case 1: {
          switch (cc) {
            case 1: {
              let _inline_1_a: int = 0;
            }
            case 1: {
              switch (cc) {
                case 1: {
                  let _inline_1__inline_0_a: int = 0;
                }
                case 1: {
                  switch (cc) {
                    case 1: {
                      let _inline_2_a: int = 0;
                    }
                    case 1: {
                      switch (cc) {
                        case 1: {
                          let _inline_2__inline_0_a: int = 0;
                        }
                        case 1: {
                          switch (cc) {
                            case 1: {
                              let _inline_2__inline_1_a: int = 0;
                            }
                            case 1: {
                              switch (cc) {
                                case 1: {
                                  let _inline_2__inline_1__inline_0_a: int = 0;
                                }
                                case 1: {
                                  fooBar();
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`
  );
});
