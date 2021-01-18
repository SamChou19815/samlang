import {
  debugPrintHighIRStatement,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_WHILE,
  HIR_INDEX_ACCESS,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
  HIR_ZERO,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
} from '../hir-expressions';
import { HIR_INT_TYPE, HIR_STRING_TYPE, HIR_IDENTIFIER_TYPE, HIR_STRUCT_TYPE } from '../hir-types';

it('debugPrintHighIRStatement works', () => {
  expect(
    debugPrintHighIRStatement(
      HIR_IF_ELSE({
        booleanExpression: HIR_ZERO,
        s1: [
          HIR_SWITCH({ caseVariable: 'f', cases: [], finalAssignments: [] }),
          HIR_SWITCH({
            caseVariable: 'f',
            cases: [
              {
                caseNumber: 1,
                statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_IDENTIFIER_TYPE('Bar')))],
                breakValue: null,
              },
              {
                caseNumber: 2,
                statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_IDENTIFIER_TYPE('Bar')))],
                breakValue: null,
              },
            ],
            finalAssignments: [
              {
                name: 'ma',
                type: HIR_INT_TYPE,
                branchValues: [HIR_VARIABLE('b1', HIR_INT_TYPE), HIR_VARIABLE('b2', HIR_INT_TYPE)],
              },
            ],
          }),
          HIR_SWITCH({
            caseVariable: 'f',
            cases: [
              {
                caseNumber: 1,
                statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_IDENTIFIER_TYPE('Bar')))],
                breakValue: HIR_ZERO,
              },
              {
                caseNumber: 2,
                statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_IDENTIFIER_TYPE('Bar')))],
                breakValue: HIR_ZERO,
              },
            ],
            finalAssignments: [
              {
                name: 'ma',
                type: HIR_INT_TYPE,
                branchValues: [HIR_VARIABLE('b1', HIR_INT_TYPE), HIR_VARIABLE('b2', HIR_INT_TYPE)],
              },
            ],
          }),
          HIR_CAST({
            name: 'foo',
            type: HIR_IDENTIFIER_TYPE('Bar'),
            assignedExpression: HIR_VARIABLE('dev', HIR_IDENTIFIER_TYPE('Bar')),
          }),
          HIR_WHILE({
            loopVariables: [
              {
                name: 'n',
                type: HIR_INT_TYPE,
                initialValue: HIR_VARIABLE('_tail_rec_param_n', HIR_INT_TYPE),
                loopValue: HIR_VARIABLE('_t0_n', HIR_INT_TYPE),
              },
              {
                name: 'acc',
                type: HIR_INT_TYPE,
                initialValue: HIR_VARIABLE('_tail_rec_param_acc', HIR_INT_TYPE),
                loopValue: HIR_VARIABLE('_t1_acc', HIR_INT_TYPE),
              },
            ],
            statements: [
              HIR_CAST({
                name: 'foo',
                type: HIR_IDENTIFIER_TYPE('Bar'),
                assignedExpression: HIR_VARIABLE('dev', HIR_IDENTIFIER_TYPE('Bar')),
              }),
            ],
          }),
          HIR_WHILE({
            loopVariables: [
              {
                name: 'n',
                type: HIR_INT_TYPE,
                initialValue: HIR_VARIABLE('_tail_rec_param_n', HIR_INT_TYPE),
                loopValue: HIR_VARIABLE('_t0_n', HIR_INT_TYPE),
              },
              {
                name: 'acc',
                type: HIR_INT_TYPE,
                initialValue: HIR_VARIABLE('_tail_rec_param_acc', HIR_INT_TYPE),
                loopValue: HIR_VARIABLE('_t1_acc', HIR_INT_TYPE),
              },
            ],
            statements: [
              HIR_CAST({
                name: 'foo',
                type: HIR_IDENTIFIER_TYPE('Bar'),
                assignedExpression: HIR_VARIABLE('dev', HIR_IDENTIFIER_TYPE('Bar')),
              }),
            ],
            breakCollector: { name: 'v', type: HIR_INT_TYPE },
          }),
          HIR_RETURN(HIR_VARIABLE('foo', HIR_IDENTIFIER_TYPE('Bar'))),
        ],
        s2: [
          HIR_BINARY({ name: 'dd', operator: '+', e1: HIR_INT(0), e2: HIR_INT(0) }),
          HIR_STRUCT_INITIALIZATION({
            structVariableName: 'baz',
            type: HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_STRING_TYPE]),
            expressionList: [HIR_NAME('meggo', HIR_STRING_TYPE)],
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('h', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('big', HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_INT_TYPE]))],
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
            pointerExpression: HIR_VARIABLE('big', HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_INT_TYPE])),
            index: 0,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [],
            s2: [],
            s1BreakValue: HIR_ZERO,
            s2BreakValue: HIR_ZERO,
            finalAssignments: [],
          }),
        ],
        s1BreakValue: null,
        s2BreakValue: null,
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
  switch (f) {
  }
  let ma: int;
  switch (f) {
    case 1: {
      return (foo: Bar);
      ma = (b1: int);
    }
    case 2: {
      return (foo: Bar);
      ma = (b2: int);
    }
  }
  let ma: int;
  switch (f) {
    case 1: {
      return (foo: Bar);
      undefined = 0;
      break;
    }
    case 2: {
      return (foo: Bar);
      undefined = 0;
      break;
    }
  }
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
  return (foo: Bar);
  bar = (b1: int);
} else {
  let dd: int = 0 + 0;
  let baz: (int, string) = [meggo];
  let vibez: int = h((big: (int, int)));
  stresso((d: int));
  let f: int = (big: (int, int))[0];
  if 0 {
    undefined = 0;
    break;
  } else {
    undefined = 0;
    break;
  }
  bar = (b2: int);
}`);
});
