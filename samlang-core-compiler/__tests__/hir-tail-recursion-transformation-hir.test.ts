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
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_WHILE_TRUE,
  HIR_INT,
  HIR_STRUCT_INITIALIZATION,
} from 'samlang-core-ast/hir-expressions';
import { debugPrintHighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { HIR_FUNCTION_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('performTailRecursiveCallTransformationOnHighIRFunction failed coalescing test', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: '',
        parameters: [],
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
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_LET({ name: '_t1', type: HIR_INT_TYPE, assignedExpression: HIR_ONE }),
          HIR_RETURN(HIR_VARIABLE('_t1', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function (): int {
  let _t1: int = 1;
  return (_t1: int);
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction simple flow test 1/2', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: 'infiniteLoop',
        parameters: [],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'infiniteLoop',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [],
          }),
          HIR_RETURN(HIR_ZERO),
        ],
      })
    )
  ).toBe(`function infiniteLoop(): int {
  while true {
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction simple flow test 2/2', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: 'infiniteLoop',
        parameters: [],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'infiniteLoop',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [],
            returnCollector: { name: 'r', type: HIR_INT_TYPE },
          }),
          HIR_RETURN(HIR_VARIABLE('r', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function infiniteLoop(): int {
  while true {
  }
}
`);
});

it('performTailRecursiveCallTransformationOnHighIRFunction linear flow test', () => {
  expect(
    debugPrintHighIRFunction(
      performTailRecursiveCallTransformationOnHighIRFunction({
        name: 'tailRec',
        parameters: ['n'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_WHILE_TRUE(
            [],
            [
              HIR_STRUCT_INITIALIZATION({
                structVariableName: 's',
                type: HIR_INT_TYPE,
                expressionList: [HIR_INT(3)],
              }),
              HIR_IF_ELSE({
                booleanExpression: HIR_ONE,
                s1: [HIR_LET({ name: 'aaa', type: HIR_INT_TYPE, assignedExpression: HIR_INT(3) })],
                s2: [HIR_RETURN(HIR_INT(3))],
              }),
            ]
          ),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'tailRec',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [
              HIR_INDEX_ACCESS({
                type: HIR_INT_TYPE,
                expression: HIR_BINARY({
                  operator: '+',
                  e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                  e2: HIR_VARIABLE('n', HIR_INT_TYPE),
                }),
                index: 0,
              }),
            ],
            returnCollector: { name: 'collector', type: HIR_INT_TYPE },
          }),
          HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let _param_n: int = (n: int);
  // _param_n = phi([n, start], [_param_n_temp_collector, loop])
  while true {
    while true {
      let s: int = [3];
      if 1 {
        let aaa: int = 3;
      } else {
        return 3;
      }
    }
    let _param_n_temp_collector: int = (((_param_n: int) + (_param_n: int))[0]: int);
    let _param_n: int = (_param_n_temp_collector: int);
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
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'tailRec1',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
            returnCollector: { name: 'collector', type: HIR_INT_TYPE },
          }),
          HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let collector: int = tailRec1((n: int));
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
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              'tailRec',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [HIR_VARIABLE('n', HIR_INT_TYPE)],
            returnCollector: { name: 'collector1', type: HIR_INT_TYPE },
          }),
          HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let collector1: int = tailRec((n: int));
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
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME(
                  'tailRec',
                  HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
                ),
                functionArguments: [
                  HIR_BINARY({ operator: '-', e1: HIR_VARIABLE('n', HIR_INT_TYPE), e2: HIR_ONE }),
                ],
                returnCollector: { name: 'collector', type: HIR_INT_TYPE },
              }),
              HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
            ],
            s2: [HIR_RETURN(HIR_ZERO)],
          }),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let _param_n: int = (n: int);
  // _param_n = phi([n, start], [_param_n_temp_collector, loop])
  while true {
    if (_param_n: int) {
      let _param_n_temp_collector: int = ((_param_n: int) + -1);
      let _param_n: int = (_param_n_temp_collector: int);
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
                returnCollector: { name: 'collector', type: HIR_INT_TYPE },
              }),
              HIR_RETURN(HIR_VARIABLE('collector', HIR_INT_TYPE)),
            ],
          }),
        ],
      })
    )
  ).toBe(`function tailRec(n: int): int {
  let _param_n: int = (n: int);
  // _param_n = phi([n, start], [_param_n_temp_collector, loop])
  while true {
    if 1 {
      return 0;
    } else {
      let _param_n_temp_collector: int = (_param_n: int);
      let _param_n: int = (_param_n_temp_collector: int);
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
                        returnCollector: { name: 'collector', type: HIR_INT_TYPE },
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
  let _param_n: int = (n: int);
  // _param_n = phi([n, start], [_param_n_temp_collector, loop])
  while true {
    if 1 {
      if 1 {
        if 1 {
          let _param_n_temp_collector: int = (_param_n: int);
          let _param_n: int = (_param_n_temp_collector: int);
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
