import {
  prettyPrintHighIRType,
  prettyPrintHighIRTypeDefinition,
  debugPrintHighIRStatement,
  debugPrintHighIRSources,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_FUNCTION_TYPE,
  HIR_CLOSURE_TYPE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_STRUCT_INITIALIZATION,
  HIR_CLOSURE_INITIALIZATION,
  HIR_ZERO,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
} from '../hir-nodes';

describe('hir-nodes', () => {
  it('prettyPrintHighIRType works', () => {
    expect(
      prettyPrintHighIRType(
        HIR_CLOSURE_TYPE(
          [HIR_INT_TYPE, HIR_BOOL_TYPE],
          HIR_FUNCTION_TYPE(
            [
              HIR_IDENTIFIER_TYPE('Foo', [HIR_STRING_TYPE]),
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Foo'),
            ],
            HIR_STRING_TYPE
          )
        )
      )
    ).toBe('$Closure<(int, bool) -> (Foo<string>, Foo) -> string>');
  });

  it('prettyPrintHighIRTypeDefinition works', () => {
    expect(
      prettyPrintHighIRTypeDefinition({
        identifier: 'A',
        type: 'object',
        typeParameters: [],
        mappings: [HIR_INT_TYPE, HIR_BOOL_TYPE],
      })
    ).toBe('object type A = [int, bool]');
    expect(
      prettyPrintHighIRTypeDefinition({
        identifier: 'B',
        type: 'variant',
        typeParameters: ['C'],
        mappings: [HIR_INT_TYPE, HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('C')],
      })
    ).toBe('variant type B<C> = [int, C]');
  });

  it('debugPrintHighIRStatement works', () => {
    expect(
      debugPrintHighIRStatement(
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName: 'baz',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('FooBar'),
              expressionList: [HIR_NAME('meggo', HIR_STRING_TYPE)],
            }),
            HIR_CLOSURE_INITIALIZATION({
              closureVariableName: 'closure',
              closureType: HIR_CLOSURE_TYPE([], HIR_INT_TYPE),
              functionName: 'foo',
              functionType: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
              context: HIR_ZERO,
            }),
            HIR_BINARY({ name: 'dd', operator: '<', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '^', e1: HIR_INT(0), e2: HIR_INT(0) }),
          ],
          s2: [
            HIR_BINARY({ name: 'dd', operator: '+', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '-', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '*', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '/', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '%', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('h', HIR_INT_TYPE),
              functionArguments: [
                HIR_VARIABLE('big', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('FooBar')),
              ],
              returnType: HIR_INT_TYPE,
              returnCollector: 'vibez',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('stresso', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('d', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
            }),
            HIR_INDEX_ACCESS({
              name: 'f',
              type: HIR_INT_TYPE,
              pointerExpression: HIR_VARIABLE(
                'big',
                HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('FooBar')
              ),
              index: 0,
            }),
          ],
          finalAssignments: [
            {
              name: 'bar',
              type: HIR_INT_TYPE,
              branch1Value: HIR_VARIABLE('b1', HIR_INT_TYPE),
              branch2Value: HIR_VARIABLE('b2', HIR_INT_TYPE),
            },
          ],
        })
      )
    ).toBe(`let bar: int;
if 0 {
  let baz: FooBar = [meggo];
  let closure: $Closure<() -> int> = Closure {
    fun: (foo: (int) -> int),
    context: 0,
  };
  let dd: bool = 0 < 0;
  let dd: bool = 0 ^ 0;
  bar = (b1: int);
} else {
  let dd: int = 0 + 0;
  let dd: int = 0 - 0;
  let dd: int = 0 * 0;
  let dd: int = 0 / 0;
  let dd: int = 0 % 0;
  let vibez: int = h((big: FooBar));
  stresso((d: int));
  let f: int = (big: FooBar)[0];
  bar = (b2: int);
}`);
  });

  it('debugPrintHighIRModule works', () => {
    expect(
      debugPrintHighIRSources({
        globalVariables: [{ name: 'dev_meggo', content: 'vibez' }],
        typeDefinitions: [
          {
            identifier: 'Foo',
            type: 'object',
            typeParameters: [],
            mappings: [HIR_INT_TYPE, HIR_BOOL_TYPE],
          },
        ],
        mainFunctionNames: ['ddd'],
        functions: [
          {
            name: 'Bar',
            parameters: ['f'],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
            body: [
              HIR_INDEX_ACCESS({
                name: 'f',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE(
                  'big',
                  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('FooBar')
                ),
                index: 0,
              }),
            ],
            returnValue: HIR_ZERO,
          },
        ],
      })
    ).toBe(`const dev_meggo = 'vibez';

object type Foo = [int, bool]
function Bar(f: int): int {
  let f: int = (big: FooBar)[0];
  return 0;
}

sources.mains = [ddd]`);

    expect(
      debugPrintHighIRSources({
        globalVariables: [],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: 'Bar',
            parameters: ['f'],
            typeParameters: ['A'],
            type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
            body: [],
            returnValue: HIR_ZERO,
          },
        ],
      })
    ).toBe(`function Bar<A>(f: int): int {
  return 0;
}
`);
  });
});
