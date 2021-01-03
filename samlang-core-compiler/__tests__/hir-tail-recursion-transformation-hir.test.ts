import performTailRecursiveCallTransformationOnHighIRFunction from '../hir-tail-recursion-transformation-hir';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_LET,
  HIR_NAME,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { debugPrintHighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { HIR_FUNCTION_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('performTailRecursiveCallTransformationOnHighIRFunction failed coalescing test', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: '',
        parameters: [],
        hasReturn: true,
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [],
      })
    )
  ).toBe(`function (): int {

}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction no tailrec call test', () => {
  expect(
    debugPrintHighIRFunction(
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
    )
  ).toBe(`function (): int {
  return 1;
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow test', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: 'tailRec',
        parameters: ['n'],
        hasReturn: true,
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'tailRec',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
            returnCollector: 'collector',
          }),
          HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  while true {
    let _tailRecTransformationArgument0: int = (n: int);
    let n: int = (_tailRecTransformationArgument0: int);
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow mismatch test 1', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: 'tailRec',
        parameters: ['n'],
        hasReturn: true,
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'tailRec1',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
            returnCollector: 'collector',
          }),
          HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let collector = tailRec1((n: int));
  return (collector: int);
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow mismatch test 2', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: 'tailRec',
        parameters: ['n'],
        hasReturn: true,
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'tailRec',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
            returnCollector: 'collector1',
          }),
          HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let collector1 = tailRec((n: int));
  return (collector: int);
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level if-else test 1', () => {
  expect(
    debugPrintHighIRFunction(
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
                  HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
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
    )
  ).toBe(`function tailRec(n: int): int {
  while true {
    if 1 {
      let _tailRecTransformationArgument0: int = (n: int);
      let n: int = (_tailRecTransformationArgument0: int);
    } else {
      return 0;
    }
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level if-else test 2', () => {
  expect(
    debugPrintHighIRFunction(
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
                  HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
                ),
                functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
                returnCollector: 'collector',
              }),
              HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
            ],
          }),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  while true {
    if 1 {
      return 0;
    } else {
      let _tailRecTransformationArgument0: int = (n: int);
      let n: int = (_tailRecTransformationArgument0: int);
    }
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction 1-level no transform test', () => {
  expect(
    debugPrintHighIRFunction(
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
    )
  ).toBe(`function tailRec(n: int): int {
  if 1 {
    return 0;
  } else {
    return 0;
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction 3-level if-else test 1', () => {
  expect(
    debugPrintHighIRFunction(
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
                          HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
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
    )
  ).toBe(`function tailRec(n: int): int {
  while true {
    if 1 {
      if 1 {
        if 1 {
          let _tailRecTransformationArgument0: int = (n: int);
          let n: int = (_tailRecTransformationArgument0: int);
        } else {
          return 0;
        }
      } else {
        return 0;
      }
    } else {
      return 0;
    }
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction 3-level if-else test 2', () => {
  expect(
    debugPrintHighIRFunction(
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
                          HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
                        ),
                        functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
                        returnCollector: 'collector',
                      }),
                    ],
                    s2: [
                      HIR_FUNCTION_CALL({
                        functionExpression: HIR_NAME(
                          'tailRec1',
                          HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
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
                      HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
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
    )
  ).toBe(`function tailRec(n: int): int {
  while true {
    if 1 {
      if 1 {
        if 1 {
          let _tailRecTransformationArgument0: int = (n: int);
          let n: int = (_tailRecTransformationArgument0: int);
        } else {
          let collector = tailRec1((n: int));
          return 0;
        }
      } else {
        return 0;
      }
    } else {
      if 1 {
        return 0;
      } else {
        let _tailRecTransformationArgument0: int = (n: int);
        let n: int = (_tailRecTransformationArgument0: int);
      }
    }
  }
}
`);
});
