import {
  debugPrintHighIRSources,
  HIR_BINARY,
  HIR_BREAK,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT_TYPE,
  HIR_NAME,
  HIR_SINGLE_IF,
  HIR_STRING_TYPE,
  HIR_STRUCT_INITIALIZATION,
  HIR_TRUE,
  HIR_VARIABLE,
  HIR_WHILE,
  HIR_ZERO,
} from '../../ast/hir-nodes';
import deduplicateHighIRTypes from '../hir-type-deduplication';

describe('hir-type-deduplication', () => {
  it('deduplicateHighIRTypes asserts on unsupported statements', () => {
    expect(() =>
      deduplicateHighIRTypes({
        globalVariables: [],
        closureTypes: [],
        typeDefinitions: [],
        mainFunctionNames: ['main'],
        functions: [
          {
            name: 'main',
            parameters: [],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            body: [
              HIR_SINGLE_IF({
                booleanExpression: HIR_ZERO,
                invertCondition: false,
                statements: [],
              }),
            ],
            returnValue: HIR_ZERO,
          },
        ],
      })
    ).toThrow();

    expect(() =>
      deduplicateHighIRTypes({
        globalVariables: [],
        closureTypes: [],
        typeDefinitions: [],
        mainFunctionNames: ['main'],
        functions: [
          {
            name: 'main',
            parameters: [],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            body: [HIR_BREAK(HIR_ZERO)],
            returnValue: HIR_ZERO,
          },
        ],
      })
    ).toThrow();

    expect(() =>
      deduplicateHighIRTypes({
        globalVariables: [],
        closureTypes: [],
        typeDefinitions: [],
        mainFunctionNames: ['main'],
        functions: [
          {
            name: 'main',
            parameters: [],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            body: [HIR_WHILE({ loopVariables: [], statements: [] })],
            returnValue: HIR_ZERO,
          },
        ],
      })
    ).toThrow();
  });

  it('deduplicateHighIRTypes works', () => {
    expect(
      debugPrintHighIRSources(
        deduplicateHighIRTypes({
          globalVariables: [],
          closureTypes: [
            {
              identifier: 'A',
              typeParameters: [],
              functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            },
            {
              identifier: 'B',
              typeParameters: [],
              functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            },
          ],
          typeDefinitions: [
            {
              identifier: 'C',
              type: 'object',
              typeParameters: [],
              names: [],
              mappings: [HIR_INT_TYPE, HIR_STRING_TYPE],
            },
            {
              identifier: 'D',
              type: 'object',
              typeParameters: [],
              names: [],
              mappings: [HIR_INT_TYPE, HIR_STRING_TYPE],
            },
          ],
          mainFunctionNames: [],
          functions: [
            {
              name: 'main',
              parameters: [],
              typeParameters: [],
              type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
              body: [
                HIR_IF_ELSE({
                  booleanExpression: HIR_TRUE,
                  s1: [
                    HIR_BINARY({
                      name: '_',
                      operator: '+',
                      e1: HIR_ZERO,
                      e2: HIR_ZERO,
                    }),
                    HIR_FUNCTION_CALL({
                      functionExpression: HIR_NAME(
                        'f',
                        HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
                      ),
                      functionArguments: [HIR_ZERO],
                      returnType: HIR_INT_TYPE,
                    }),
                    HIR_INDEX_ACCESS({
                      name: '_',
                      type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'),
                      pointerExpression: HIR_ZERO,
                      index: 0,
                    }),
                  ],
                  s2: [
                    HIR_STRUCT_INITIALIZATION({
                      structVariableName: '_',
                      type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('D'),
                      expressionList: [HIR_ZERO],
                    }),
                    HIR_CLOSURE_INITIALIZATION({
                      closureVariableName: '_',
                      closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('C'),
                      functionName: 'f',
                      functionType: HIR_FUNCTION_TYPE(
                        [HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('E')],
                        HIR_INT_TYPE
                      ),
                      context: HIR_VARIABLE('v', HIR_INT_TYPE),
                    }),
                  ],
                  finalAssignments: [
                    {
                      name: '_',
                      type: HIR_INT_TYPE,
                      branch1Value: HIR_ZERO,
                      branch2Value: HIR_ZERO,
                    },
                  ],
                }),
              ],
              returnValue: HIR_ZERO,
            },
          ],
        })
      )
    ).toBe(`closure type A = () -> int
object type C = [int, string]
function main(): int {
  let _: int;
  if 1 {
    let _: int = 0 + 0;
    f(0);
    let _: A = 0[0];
    _ = 0;
  } else {
    let _: C = [0];
    let _: C = Closure { fun: (f: (E) -> int), context: (v: int) };
    _ = 0;
  }
  return 0;
}
`);
  });
});
