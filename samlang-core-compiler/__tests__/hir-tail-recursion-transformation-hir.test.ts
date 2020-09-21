import performTailRecursiveCallTransformationOnHighIRFunction from '../hir-tail-recursion-transformation-hir';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
  HIR_LET,
  HIR_NAME,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';

it('performTailRecursiveCallTransformationOnHighIRFunction failed coalescing test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: '',
      parameters: [],
      hasReturn: true,
      body: [],
    })
  ).toEqual({
    name: '',
    parameters: [],
    hasReturn: true,
    body: [],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction no tailrec call test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: '',
      parameters: [],
      hasReturn: true,
      body: [
        HIR_LET({ name: '_t1', assignedExpression: HIR_ONE }),
        HIR_RETURN(HIR_VARIABLE('_t1')),
      ],
    })
  ).toEqual({
    name: '',
    parameters: [],
    hasReturn: true,
    body: [HIR_RETURN(HIR_ONE)],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('tailRec'),
          functionArguments: [HIR_VARIABLE('n')],
          returnCollector: 'collector',
        }),
        HIR_RETURN(HIR_VARIABLE('collector')),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_WHILE_TRUE([
        HIR_LET({ name: '_tailRecTransformationArgument0', assignedExpression: HIR_VARIABLE('n') }),
        HIR_LET({ name: 'n', assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0') }),
      ]),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow mismatch test 1', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('tailRec1'),
          functionArguments: [HIR_VARIABLE('n')],
          returnCollector: 'collector',
        }),
        HIR_RETURN(HIR_VARIABLE('collector')),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('tailRec1'),
        functionArguments: [HIR_VARIABLE('n')],
        returnCollector: 'collector',
      }),
      HIR_RETURN(HIR_VARIABLE('collector')),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow mismatch test 2', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('tailRec'),
          functionArguments: [HIR_VARIABLE('n')],
          returnCollector: 'collector1',
        }),
        HIR_RETURN(HIR_VARIABLE('collector')),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('tailRec'),
        functionArguments: [HIR_VARIABLE('n')],
        returnCollector: 'collector1',
      }),
      HIR_RETURN(HIR_VARIABLE('collector')),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level if-else test 1', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('tailRec'),
              functionArguments: [HIR_VARIABLE('n')],
              returnCollector: 'collector',
            }),
            HIR_RETURN(HIR_VARIABLE('collector')),
          ],
          s2: [HIR_RETURN(HIR_ZERO)],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_LET({
              name: '_tailRecTransformationArgument0',
              assignedExpression: HIR_VARIABLE('n'),
            }),
            HIR_LET({
              name: 'n',
              assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0'),
            }),
          ],
          s2: [HIR_RETURN(HIR_ZERO)],
        }),
      ]),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level if-else test 2', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [HIR_RETURN(HIR_ZERO)],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('tailRec'),
              functionArguments: [HIR_VARIABLE('n')],
              returnCollector: 'collector',
            }),
            HIR_RETURN(HIR_VARIABLE('collector')),
          ],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [HIR_RETURN(HIR_ZERO)],
          s2: [
            HIR_LET({
              name: '_tailRecTransformationArgument0',
              assignedExpression: HIR_VARIABLE('n'),
            }),
            HIR_LET({
              name: 'n',
              assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0'),
            }),
          ],
        }),
      ]),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level no transform test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [HIR_RETURN(HIR_ZERO)],
          s2: [HIR_RETURN(HIR_ZERO)],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_IF_ELSE({
        booleanExpression: HIR_ONE,
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [HIR_RETURN(HIR_ZERO)],
      }),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction 3-level if-else test 1', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ONE,
              s1: [
                HIR_IF_ELSE({
                  booleanExpression: HIR_ONE,
                  s1: [
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME('tailRec'),
                      functionArguments: [HIR_VARIABLE('n')],
                      returnCollector: 'collector',
                    }),
                    HIR_RETURN(HIR_VARIABLE('collector')),
                  ],
                  s2: [HIR_RETURN(HIR_ZERO)],
                }),
              ],
              s2: [HIR_RETURN(HIR_ZERO)],
            }),
          ],
          s2: [HIR_RETURN(HIR_ZERO)],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    body: [
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ONE,
              s1: [
                HIR_IF_ELSE({
                  booleanExpression: HIR_ONE,
                  s1: [
                    HIR_LET({
                      name: '_tailRecTransformationArgument0',
                      assignedExpression: HIR_VARIABLE('n'),
                    }),
                    HIR_LET({
                      name: 'n',
                      assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0'),
                    }),
                  ],
                  s2: [HIR_RETURN(HIR_ZERO)],
                }),
              ],
              s2: [HIR_RETURN(HIR_ZERO)],
            }),
          ],
          s2: [HIR_RETURN(HIR_ZERO)],
        }),
      ]),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction 3-level if-else test 2', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: false,
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ONE,
              s1: [
                HIR_IF_ELSE({
                  booleanExpression: HIR_ONE,
                  s1: [
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME('tailRec'),
                      functionArguments: [HIR_VARIABLE('n')],
                      returnCollector: 'collector',
                    }),
                  ],
                  s2: [
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME('tailRec1'),
                      functionArguments: [HIR_VARIABLE('n')],
                      returnCollector: 'collector',
                    }),
                  ],
                }),
              ],
              s2: [],
            }),
          ],
          s2: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ONE,
              s1: [],
              s2: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('tailRec'),
                  functionArguments: [HIR_VARIABLE('n')],
                  returnCollector: 'collector',
                }),
              ],
            }),
          ],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: false,
    body: [
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ONE,
              s1: [
                HIR_IF_ELSE({
                  booleanExpression: HIR_ONE,
                  s1: [
                    HIR_LET({
                      name: '_tailRecTransformationArgument0',
                      assignedExpression: HIR_VARIABLE('n'),
                    }),
                    HIR_LET({
                      name: 'n',
                      assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0'),
                    }),
                  ],
                  s2: [
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME('tailRec1'),
                      functionArguments: [HIR_VARIABLE('n')],
                      returnCollector: 'collector',
                    }),
                    HIR_RETURN(HIR_ZERO),
                  ],
                }),
              ],
              s2: [HIR_RETURN(HIR_ZERO)],
            }),
          ],
          s2: [
            HIR_IF_ELSE({
              booleanExpression: HIR_ONE,
              s1: [HIR_RETURN(HIR_ZERO)],
              s2: [
                HIR_LET({
                  name: '_tailRecTransformationArgument0',
                  assignedExpression: HIR_VARIABLE('n'),
                }),
                HIR_LET({
                  name: 'n',
                  assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0'),
                }),
              ],
            }),
          ],
        }),
      ]),
    ],
  });
});
