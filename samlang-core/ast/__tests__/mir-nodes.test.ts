import {
  ENCODED_FUNCTION_NAME_FREE,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_THROW,
} from '../common-names';
import {
  isTheSameMidIRType,
  MIR_ANY_TYPE,
  MIR_BINARY,
  MIR_BOOL_TYPE,
  MIR_BREAK,
  MIR_CAST,
  MIR_FUNCTION_CALL,
  MIR_FUNCTION_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_IF_ELSE,
  MIR_INDEX_ACCESS,
  MIR_INT,
  MIR_INT_TYPE,
  MIR_NAME,
  MIR_SINGLE_IF,
  MIR_STRING_TYPE,
  MIR_STRUCT_INITIALIZATION,
  MIR_VARIABLE,
  MIR_WHILE,
  MIR_ZERO,
  prettyPrintMidIRSourcesAsJSSources,
  prettyPrintMidIRSourcesAsTSSources,
  prettyPrintMidIRType,
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
    ).toBe('(t0: number, t1: number) => (t0: Foo, t1: any) => Str');
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
            type: MIR_FUNCTION_TYPE([MIR_STRING_TYPE], MIR_INT_TYPE),
            body: [
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
                  MIR_BINARY({ name: 'dd', operator: '<', e1: MIR_INT(0), e2: MIR_INT(0) }),
                  MIR_BINARY({ name: 'dd', operator: '^', e1: MIR_INT(0), e2: MIR_INT(0) }),
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
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe(`/** @type {Str} */ const dev_meggo = [0, "vibez"];
function Bar(f) {
  let bar;
  if (0) {
    let foo = /** @type {Bar} */ (dev);
    let n = _tail_rec_param_n;
    let acc = _tail_rec_param_acc;
    while (true) {
      let foo = /** @type {Bar} */ (dev);
      break;
      n = _t0_n;
      acc = _t1_acc;
    }
    let n = _tail_rec_param_n;
    let acc = _tail_rec_param_acc;
    let v;
    while (true) {
      let foo = /** @type {Bar} */ (dev);
      v = 0;
      break;
      n = _t0_n;
      acc = _t1_acc;
    }
    bar = b1;
  } else {
    let dd = 0 + 0;
    let dd = 0 < 0;
    let dd = 0 ^ 0;
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
  }
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

  it('prettyPrintMidIRSourcesAsTSSources works', () => {
    expect(
      prettyPrintMidIRSourcesAsTSSources({
        globalVariables: [{ name: 'dev_meggo', content: 'vibez' }],
        typeDefinitions: [{ identifier: 'Foo', mappings: [MIR_INT_TYPE, MIR_ANY_TYPE] }],
        mainFunctionNames: [],
        functions: [
          {
            name: 'Bar',
            parameters: ['f'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
            body: [
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
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe(`type Str = [number, string];
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([, line]: Str): number => { console.log(line); return 0; };
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([, v]: Str): number => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v: number): Str => [1, String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = ([, v]: Str): number => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v: unknown): number => 0;
const dev_meggo: Str = [0, "vibez"];
type Foo = [number, any];
function Bar(f: number): number {
  let bar: number;
  if (0) {
    let foo = dev as Bar;
    let n: number = _tail_rec_param_n;
    let acc: number = _tail_rec_param_acc;
    while (true) {
      let foo = dev as Bar;
      n = _t0_n;
      acc = _t1_acc;
    }
    let n: number = _tail_rec_param_n;
    let acc: number = _tail_rec_param_acc;
    let v: number;
    while (true) {
      let foo = dev as Bar;
      n = _t0_n;
      acc = _t1_acc;
    }
    bar = b1;
  } else {
    let dd: number = 0 + 0;
    let baz: FooBar = [meggo];
    let vibez: number = h(big);
    stresso(d);
    let f: number = big[0];
    if (0) {
      break;
    }
    if (!0) {
      break;
    }
    bar = b2;
  }
  return 0;
}
`);
  });
});
