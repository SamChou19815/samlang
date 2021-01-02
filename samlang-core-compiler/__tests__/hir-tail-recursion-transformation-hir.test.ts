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
import { HIR_FUNCTION_TYPE, HIR_INT_TYPE, HIR_POINTER_TYPE } from 'samlang-core-ast/hir-types';

it('performTailRecursiveCallTransformationOnHighIRFunction failed coalescing test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: '',
      parameters: [],
      hasReturn: true,
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [],
    })
  ).toEqual({
    name: '',
    parameters: [],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction no tailrec call test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: '',
      parameters: [],
      hasReturn: true,
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_LET({ name: '_t1', type: HIR_INT_TYPE, assignedExpression: HIR_ONE }),
        HIR_RETURN(HIR_VARIABLE('_t1', HIR_INT_TYPE)),
      ],
    })
  ).toEqual({
    name: '',
    parameters: [],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
    body: [HIR_RETURN(HIR_ONE)],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow test', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            'tailRec',
            HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
          ),
          functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
          returnCollector: 'collector',
        }),
        HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
    body: [
      HIR_WHILE_TRUE([
        HIR_LET({
          name: '_tailRecTransformationArgument0',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
        }),
        HIR_LET({
          name: 'n',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0', HIR_INT_TYPE),
        }),
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
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            'tailRec1',
            HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
          ),
          functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
          returnCollector: 'collector',
        }),
        HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME(
          'tailRec1',
          HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
        ),
        functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
        returnCollector: 'collector',
      }),
      HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow mismatch test 2', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            'tailRec',
            HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
          ),
          functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
          returnCollector: 'collector1',
        }),
        HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME(
          'tailRec',
          HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
        ),
        functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
        returnCollector: 'collector1',
      }),
      HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
    ],
  });
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level if-else test 1', () => {
  expect(
    performTailRecursiveCallTransformationOnHighIRFunction({
      name: 'tailRec',
      parameters: ['n'],
      hasReturn: true,
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME(
                'tailRec',
                HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
              ),
              functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
              returnCollector: 'collector',
            }),
            HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
          ],
          s2: [HIR_RETURN(HIR_ZERO)],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
    body: [
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_LET({
              name: '_tailRecTransformationArgument0',
              type: HIR_INT_TYPE,
              assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
            }),
            HIR_LET({
              name: 'n',
              type: HIR_INT_TYPE,
              assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0', HIR_INT_TYPE),
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
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      body: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [HIR_RETURN(HIR_ZERO)],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME(
                'tailRec',
                HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
              ),
              functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
              returnCollector: 'collector',
            }),
            HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
          ],
        }),
      ],
    })
  ).toEqual({
    name: 'tailRec',
    parameters: ['n'],
    hasReturn: true,
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
    body: [
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [HIR_RETURN(HIR_ZERO)],
          s2: [
            HIR_LET({
              name: '_tailRecTransformationArgument0',
              type: HIR_INT_TYPE,
              assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
            }),
            HIR_LET({
              name: 'n',
              type: HIR_INT_TYPE,
              assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0', HIR_INT_TYPE),
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
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
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
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
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
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
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
                      functionExpression: HIR_NAME(
                        'tailRec',
                        HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
                      ),
                      functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
                      returnCollector: 'collector',
                    }),
                    HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
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
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
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
                      type: HIR_INT_TYPE,
                      assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
                    }),
                    HIR_LET({
                      name: 'n',
                      type: HIR_INT_TYPE,
                      assignedExpression: HIR_VARIABLE(
                        '_tailRecTransformationArgument0',
                        HIR_INT_TYPE
                      ),
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
      type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
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
                      functionExpression: HIR_NAME(
                        'tailRec',
                        HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
                      ),
                      functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
                      returnCollector: 'collector',
                    }),
                  ],
                  s2: [
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME(
                        'tailRec1',
                        HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
                      ),
                      functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
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
                  functionExpression: HIR_NAME(
                    'tailRec',
                    HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
                  ),
                  functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
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
    type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
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
                      type: HIR_INT_TYPE,
                      assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
                    }),
                    HIR_LET({
                      name: 'n',
                      type: HIR_INT_TYPE,
                      assignedExpression: HIR_VARIABLE(
                        '_tailRecTransformationArgument0',
                        HIR_INT_TYPE
                      ),
                    }),
                  ],
                  s2: [
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME(
                        'tailRec1',
                        HIR_POINTER_TYPE(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE))
                      ),
                      functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
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
                  type: HIR_INT_TYPE,
                  assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
                }),
                HIR_LET({
                  name: 'n',
                  type: HIR_INT_TYPE,
                  assignedExpression: HIR_VARIABLE('_tailRecTransformationArgument0', HIR_INT_TYPE),
                }),
              ],
            }),
          ],
        }),
      ]),
    ],
  });
});
