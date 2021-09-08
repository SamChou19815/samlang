import {
  prettyPrintMidIRType,
  isTheSameMidIRType,
  prettyPrintMidIRExpressionAsJSExpression,
  prettyPrintMidIRStatementAsJSStatement,
  prettyPrintMidIRSourcesAsJSSources,
  debugPrintMidIRStatement,
  debugPrintMidIRSources,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_INDEX_ACCESS,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_ZERO,
  MIR_INT,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_INT_TYPE,
  MIR_BOOL_TYPE,
  MIR_ANY_TYPE,
  MIR_STRING_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_FUNCTION_TYPE,
} from '../mir-nodes';

describe('mir-nodes', () => {
  it('prettyPrintMidIRType works', () => {
    expect(
      prettyPrintMidIRType(
        MIR_FUNCTION_TYPE(
          [MIR_INT_TYPE, MIR_INT_TYPE],
          MIR_FUNCTION_TYPE([MIR_IDENTIFIER_TYPE('Foo'), MIR_ANY_TYPE], MIR_STRING_TYPE)
        )
      )
    ).toBe('(int, int) -> (Foo, any) -> string');
  });

  it('prettyPrintMidIRExpressionAsJSExpression works', () => {
    expect(prettyPrintMidIRExpressionAsJSExpression(MIR_ZERO)).toBe('0');
    expect(prettyPrintMidIRExpressionAsJSExpression(MIR_NAME('a', MIR_STRING_TYPE))).toBe('a');
    expect(prettyPrintMidIRExpressionAsJSExpression(MIR_VARIABLE('a', MIR_STRING_TYPE))).toBe('a');
  });

  it('prettyPrintMidIRStatementAsJSStatement works', () => {
    expect(
      prettyPrintMidIRStatementAsJSStatement(
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [
            MIR_CAST({
              name: 'foo',
              type: MIR_IDENTIFIER_TYPE('Bar'),
              assignedExpression: MIR_VARIABLE('dev', MIR_IDENTIFIER_TYPE('Bar')),
            }),
            MIR_WHILE({
              loopVariables: [
                {
                  name: 'n',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_n', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t0_n', MIR_INT_TYPE),
                },
                {
                  name: 'acc',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_acc', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t1_acc', MIR_INT_TYPE),
                },
              ],
              statements: [
                MIR_CAST({
                  name: 'foo',
                  type: MIR_IDENTIFIER_TYPE('Bar'),
                  assignedExpression: MIR_VARIABLE('dev', MIR_IDENTIFIER_TYPE('Bar')),
                }),
                MIR_BREAK(MIR_ZERO),
              ],
            }),
            MIR_WHILE({
              loopVariables: [
                {
                  name: 'n',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_n', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t0_n', MIR_INT_TYPE),
                },
                {
                  name: 'acc',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_acc', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t1_acc', MIR_INT_TYPE),
                },
              ],
              statements: [
                MIR_CAST({
                  name: 'foo',
                  type: MIR_IDENTIFIER_TYPE('Bar'),
                  assignedExpression: MIR_VARIABLE('dev', MIR_IDENTIFIER_TYPE('Bar')),
                }),
                MIR_BREAK(MIR_ZERO),
              ],
              breakCollector: { name: 'v', type: MIR_INT_TYPE },
            }),
          ],
          s2: [
            MIR_BINARY({ name: 'dd', operator: '+', e1: MIR_INT(0), e2: MIR_INT(0) }),
            MIR_BINARY({ name: 'dd', operator: '/', e1: MIR_INT(0), e2: MIR_INT(0) }),
            MIR_STRUCT_INITIALIZATION({
              structVariableName: 'baz',
              type: MIR_IDENTIFIER_TYPE('FooBar'),
              expressionList: [MIR_NAME('meggo', MIR_STRING_TYPE)],
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('h', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('big', MIR_IDENTIFIER_TYPE('FooBar'))],
              returnType: MIR_INT_TYPE,
              returnCollector: 'vibez',
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('stresso', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('d', MIR_INT_TYPE)],
              returnType: MIR_INT_TYPE,
            }),
            MIR_INDEX_ACCESS({
              name: 'f',
              type: MIR_INT_TYPE,
              pointerExpression: MIR_VARIABLE('big', MIR_IDENTIFIER_TYPE('FooBar')),
              index: 0,
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: false,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: true,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
          ],
          finalAssignments: [
            {
              name: 'bar',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('b1', MIR_INT_TYPE),
              branch2Value: MIR_VARIABLE('b2', MIR_INT_TYPE),
            },
          ],
        })
      )
    ).toBe(`let bar;
if (0) {
  let foo = dev;
  let n = _tail_rec_param_n;
  let acc = _tail_rec_param_acc;
  while (true) {
    let foo = dev;
    break;
    n = _t0_n;
    acc = _t1_acc;
  }
  let n = _tail_rec_param_n;
  let acc = _tail_rec_param_acc;
  let v;
  while (true) {
    let foo = dev;
    v = 0;
    break;
    n = _t0_n;
    acc = _t1_acc;
  }
  bar = b1;
} else {
  let dd = 0 + 0;
  let dd = Math.floor(0 / 0);
  let baz = [meggo];
  let vibez = h(big);
  stresso(d);
  let f = big[0];
  if (0) {
    break;
  }
  if (!0) {
    break;
  }
  bar = b2;
}`);
  });

  it('prettyPrintMidIRSourcesAsJSSources works', () => {
    expect(
      prettyPrintMidIRSourcesAsJSSources({
        globalVariables: [{ name: 'dev_meggo', content: 'vibez' }],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: 'Bar',
            parameters: ['f'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
            body: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe(`const dev_meggo = "vibez";
function Bar(f) {
  let a = 0;
  return 0;
}
`);
  });

  it('isTheSameMidIRType works', () => {
    expect(isTheSameMidIRType(MIR_ANY_TYPE, MIR_STRING_TYPE)).toBeTruthy();
    expect(isTheSameMidIRType(MIR_STRING_TYPE, MIR_ANY_TYPE)).toBeTruthy();
    expect(isTheSameMidIRType(MIR_STRING_TYPE, MIR_STRING_TYPE)).toBeTruthy();
    expect(isTheSameMidIRType(MIR_ANY_TYPE, MIR_ANY_TYPE)).toBeTruthy();

    expect(isTheSameMidIRType(MIR_INT_TYPE, MIR_ANY_TYPE)).toBeFalsy();
    expect(isTheSameMidIRType(MIR_INT_TYPE, MIR_BOOL_TYPE)).toBeFalsy();
    expect(isTheSameMidIRType(MIR_INT_TYPE, MIR_INT_TYPE)).toBeTruthy();
    expect(isTheSameMidIRType(MIR_BOOL_TYPE, MIR_BOOL_TYPE)).toBeTruthy();
    expect(isTheSameMidIRType(MIR_BOOL_TYPE, MIR_INT_TYPE)).toBeFalsy();

    expect(isTheSameMidIRType(MIR_IDENTIFIER_TYPE('A'), MIR_ANY_TYPE)).toBeFalsy();
    expect(isTheSameMidIRType(MIR_IDENTIFIER_TYPE('A'), MIR_IDENTIFIER_TYPE('B'))).toBeFalsy();
    expect(isTheSameMidIRType(MIR_IDENTIFIER_TYPE('A'), MIR_IDENTIFIER_TYPE('A'))).toBeTruthy();

    expect(
      isTheSameMidIRType(MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE), MIR_INT_TYPE)
    ).toBeFalsy();
    expect(
      isTheSameMidIRType(
        MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
        MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_INT_TYPE)
      )
    ).toBeFalsy();
    expect(
      isTheSameMidIRType(
        MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
        MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_BOOL_TYPE)
      )
    ).toBeFalsy();
    expect(
      isTheSameMidIRType(
        MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
        MIR_FUNCTION_TYPE([], MIR_BOOL_TYPE)
      )
    ).toBeFalsy();
    expect(
      isTheSameMidIRType(
        MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
        MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE)
      )
    ).toBeTruthy();
  });

  it('MIR_BINARY test', () => {
    MIR_BINARY({
      name: '',
      operator: '-',
      e1: MIR_ZERO,
      e2: MIR_INT(-2147483648),
    });

    MIR_BINARY({
      name: '',
      operator: '-',
      e1: MIR_ZERO,
      e2: MIR_INT(483648),
    });
  });

  it('debugPrintMidIRStatement works', () => {
    expect(
      debugPrintMidIRStatement(
        MIR_IF_ELSE({
          booleanExpression: MIR_ZERO,
          s1: [
            MIR_CAST({
              name: 'foo',
              type: MIR_IDENTIFIER_TYPE('Bar'),
              assignedExpression: MIR_VARIABLE('dev', MIR_IDENTIFIER_TYPE('Bar')),
            }),
            MIR_WHILE({
              loopVariables: [
                {
                  name: 'n',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_n', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t0_n', MIR_INT_TYPE),
                },
                {
                  name: 'acc',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_acc', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t1_acc', MIR_INT_TYPE),
                },
              ],
              statements: [
                MIR_CAST({
                  name: 'foo',
                  type: MIR_IDENTIFIER_TYPE('Bar'),
                  assignedExpression: MIR_VARIABLE('dev', MIR_IDENTIFIER_TYPE('Bar')),
                }),
              ],
            }),
            MIR_WHILE({
              loopVariables: [
                {
                  name: 'n',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_n', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t0_n', MIR_INT_TYPE),
                },
                {
                  name: 'acc',
                  type: MIR_INT_TYPE,
                  initialValue: MIR_VARIABLE('_tail_rec_param_acc', MIR_INT_TYPE),
                  loopValue: MIR_VARIABLE('_t1_acc', MIR_INT_TYPE),
                },
              ],
              statements: [
                MIR_CAST({
                  name: 'foo',
                  type: MIR_IDENTIFIER_TYPE('Bar'),
                  assignedExpression: MIR_VARIABLE('dev', MIR_IDENTIFIER_TYPE('Bar')),
                }),
              ],
              breakCollector: { name: 'v', type: MIR_INT_TYPE },
            }),
          ],
          s2: [
            MIR_BINARY({ name: 'dd', operator: '+', e1: MIR_INT(0), e2: MIR_INT(0) }),
            MIR_STRUCT_INITIALIZATION({
              structVariableName: 'baz',
              type: MIR_IDENTIFIER_TYPE('FooBar'),
              expressionList: [MIR_NAME('meggo', MIR_STRING_TYPE)],
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('h', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('big', MIR_IDENTIFIER_TYPE('FooBar'))],
              returnType: MIR_INT_TYPE,
              returnCollector: 'vibez',
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('stresso', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('d', MIR_INT_TYPE)],
              returnType: MIR_INT_TYPE,
            }),
            MIR_INDEX_ACCESS({
              name: 'f',
              type: MIR_INT_TYPE,
              pointerExpression: MIR_VARIABLE('big', MIR_IDENTIFIER_TYPE('FooBar')),
              index: 0,
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: false,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: true,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
          ],
          finalAssignments: [
            {
              name: 'bar',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('b1', MIR_INT_TYPE),
              branch2Value: MIR_VARIABLE('b2', MIR_INT_TYPE),
            },
          ],
        })
      )
    ).toBe(`let bar: int;
if 0 {
  let foo: Bar = (dev: Bar);
  let n: int = (_tail_rec_param_n: int);
  let acc: int = (_tail_rec_param_acc: int);
  while (true) {
    let foo: Bar = (dev: Bar);
    n = (_t0_n: int);
    acc = (_t1_acc: int);
  }
  let n: int = (_tail_rec_param_n: int);
  let acc: int = (_tail_rec_param_acc: int);
  let v: int;
  while (true) {
    let foo: Bar = (dev: Bar);
    n = (_t0_n: int);
    acc = (_t1_acc: int);
  }
  bar = (b1: int);
} else {
  let dd: int = 0 + 0;
  let baz: FooBar = [meggo];
  let vibez: int = h((big: FooBar));
  stresso((d: int));
  let f: int = (big: FooBar)[0];
  if 0 {
    undefined = 0;
    break;
  }
  if !0 {
    undefined = 0;
    break;
  }
  bar = (b2: int);
}`);
  });

  it('debugPrintMidIRSources works', () => {
    expect(
      debugPrintMidIRSources({
        globalVariables: [{ name: 'dev_meggo', content: 'vibez' }],
        typeDefinitions: [{ identifier: 'Foo', mappings: [MIR_INT_TYPE, MIR_ANY_TYPE] }],
        mainFunctionNames: [],
        functions: [
          {
            name: 'Bar',
            parameters: ['f'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
            body: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe(`const dev_meggo = 'vibez';

type Foo = (int, any);

function Bar(f: int): int {
  let a: int = 0;
  return 0;
}
`);
  });
});
