import {
  debugPrintHighIRSources,
  debugPrintHighIRStatement,
  HIR_BINARY,
  HIR_BOOL_TYPE,
  HIR_BREAK,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_INT_TYPE,
  HIR_NAME,
  HIR_SINGLE_IF,
  HIR_STRING_TYPE,
  HIR_STRUCT_INITIALIZATION,
  HIR_VARIABLE,
  HIR_WHILE,
  HIR_ZERO,
  prettyPrintHighIRType,
  prettyPrintHighIRTypeDefinition,
} from '../hir-nodes';

describe('hir-nodes', () => {
  it('prettyPrintHighIRType works', () => {
    expect(
      prettyPrintHighIRType(
        HIR_FUNCTION_TYPE(
          [
            HIR_IDENTIFIER_TYPE('Foo', [HIR_STRING_TYPE]),
            HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Foo'),
          ],
          HIR_STRING_TYPE
        )
      )
    ).toBe('(Foo<string>, Foo) -> string');
  });

  it('prettyPrintHighIRTypeDefinition works', () => {
    expect(
      prettyPrintHighIRTypeDefinition({
        identifier: 'A',
        type: 'object',
        typeParameters: [],
        names: [],
        mappings: [HIR_INT_TYPE, HIR_BOOL_TYPE],
      })
    ).toBe('object type A = [int, bool]');
    expect(
      prettyPrintHighIRTypeDefinition({
        identifier: 'B',
        type: 'variant',
        typeParameters: ['C'],
        names: [],
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
              closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('CCC'),
              functionName: 'foo',
              functionType: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
              context: HIR_ZERO,
            }),
            HIR_BINARY({ name: 'dd', operator: '<', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '^', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_WHILE({
              loopVariables: [],
              statements: [
                HIR_SINGLE_IF({
                  booleanExpression: HIR_ZERO,
                  invertCondition: false,
                  statements: [],
                }),
              ],
            }),
            HIR_WHILE({
              loopVariables: [
                { name: '_', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
              ],
              statements: [
                HIR_SINGLE_IF({
                  booleanExpression: HIR_ZERO,
                  invertCondition: true,
                  statements: [HIR_BREAK(HIR_ZERO)],
                }),
              ],
              breakCollector: { name: '_', type: HIR_INT_TYPE },
            }),
          ],
          s2: [
            HIR_BINARY({ name: 'dd', operator: '+', e1: HIR_INT(0), e2: HIR_INT(0) }),
            HIR_BINARY({ name: 'dd', operator: '-', e1: HIR_INT(0), e2: HIR_INT(-2147483648) }),
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
  let closure: CCC = Closure { fun: (foo: (int) -> int), context: 0 };
  let dd: bool = 0 < 0;
  let dd: bool = 0 ^ 0;
  while (true) {
    if 0 {
    }
  }
  let _: int = 0;
  let _: int;
  while (true) {
    if !0 {
      _ = 0;
      break;
    }
    _ = 0;
  }
  bar = (b1: int);
} else {
  let dd: int = 0 + 0;
  let dd: int = 0 - -2147483648;
  let dd: int = 0 + 0;
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
        closureTypes: [
          {
            identifier: 'c',
            typeParameters: [],
            functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          },
        ],
        typeDefinitions: [
          {
            identifier: 'Foo',
            type: 'object',
            typeParameters: [],
            names: [],
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

closure type c = () -> int
object type Foo = [int, bool]
function Bar(f: int): int {
  let f: int = (big: FooBar)[0];
  return 0;
}

sources.mains = [ddd]`);

    expect(
      debugPrintHighIRSources({
        globalVariables: [],
        closureTypes: [],
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
