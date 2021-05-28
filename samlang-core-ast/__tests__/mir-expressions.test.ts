import {
  debugPrintMidIRStatement,
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
} from '../mir-expressions';
import { MIR_INT_TYPE, MIR_STRING_TYPE, MIR_IDENTIFIER_TYPE } from '../mir-types';

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
