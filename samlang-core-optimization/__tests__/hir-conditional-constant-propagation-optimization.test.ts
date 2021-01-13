import optimizeHighIRStatementsByConditionalConstantPropagation from '../hir-conditional-constant-propagation-optimization';

import {
  HighIRStatement,
  debugPrintHighIRStatement,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
  HIR_TRUE,
  HIR_FALSE,
} from 'samlang-core-ast/hir-expressions';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const assertCorrectlyOptimized = (statements: HighIRStatement[], expected: string): void => {
  expect(
    optimizeHighIRStatementsByConditionalConstantPropagation(statements)
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

it('optimizeHighIRStatementsByConditionalConstantPropagation works on a series of simple statements.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({
        name: 'a0',
        operator: '+',
        e1: HIR_INT(3),
        e2: HIR_INT(3),
      }),
      HIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: HIR_VARIABLE('a0', HIR_INT_TYPE),
        e2: HIR_VARIABLE('a0', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'a2',
        operator: '-',
        e1: HIR_VARIABLE('a1', HIR_INT_TYPE),
        e2: HIR_VARIABLE('a0', HIR_INT_TYPE),
      }),
      HIR_INDEX_ACCESS({
        name: 'i0',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a0', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_BINARY({
        name: 'a3',
        operator: '*',
        e1: HIR_VARIABLE('a2', HIR_INT_TYPE),
        e2: HIR_ONE,
      }),
      HIR_BINARY({
        name: 'b1',
        operator: '/',
        e1: HIR_VARIABLE('a2', HIR_INT_TYPE),
        e2: HIR_VARIABLE('a2', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b2',
        operator: '-',
        e1: HIR_VARIABLE('a2', HIR_INT_TYPE),
        e2: HIR_VARIABLE('a2', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b3',
        operator: '*',
        e1: HIR_VARIABLE('b1', HIR_INT_TYPE),
        e2: HIR_VARIABLE('b2', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b4',
        operator: '%',
        e1: HIR_VARIABLE('b1', HIR_INT_TYPE),
        e2: HIR_VARIABLE('b1', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b5',
        operator: '-',
        e1: HIR_VARIABLE('i0', HIR_INT_TYPE),
        e2: HIR_VARIABLE('i0', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b6',
        operator: '%',
        e1: HIR_VARIABLE('i0', HIR_INT_TYPE),
        e2: HIR_VARIABLE('i0', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b7',
        operator: '/',
        e1: HIR_VARIABLE('i0', HIR_INT_TYPE),
        e2: HIR_VARIABLE('i0', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'b8',
        operator: '*',
        e1: HIR_VARIABLE('i0', HIR_INT_TYPE),
        e2: HIR_VARIABLE('i0', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'a4',
        operator: '+',
        e1: HIR_VARIABLE('a3', HIR_INT_TYPE),
        e2: HIR_ZERO,
      }),
      HIR_BINARY({
        name: 'a5',
        operator: '/',
        e1: HIR_VARIABLE('a4', HIR_INT_TYPE),
        e2: HIR_VARIABLE('b1', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'a6',
        operator: '/',
        e1: HIR_VARIABLE('i1', HIR_INT_TYPE),
        e2: HIR_VARIABLE('a5', HIR_INT_TYPE),
      }),
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_INT_TYPE,
        expressionList: [
          HIR_VARIABLE('b2', HIR_INT_TYPE),
          HIR_VARIABLE('a6', HIR_INT_TYPE),
          HIR_VARIABLE('a5', HIR_INT_TYPE),
        ],
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
        functionArguments: [
          HIR_VARIABLE('b1', HIR_INT_TYPE),
          HIR_VARIABLE('b2', HIR_INT_TYPE),
          HIR_VARIABLE('b3', HIR_INT_TYPE),
          HIR_VARIABLE('b4', HIR_INT_TYPE),
          HIR_VARIABLE('b5', HIR_INT_TYPE),
          HIR_VARIABLE('b6', HIR_INT_TYPE),
          HIR_VARIABLE('b7', HIR_INT_TYPE),
        ],
      }),
      HIR_BINARY({
        name: 'a7',
        operator: '%',
        e1: HIR_VARIABLE('a5', HIR_INT_TYPE),
        e2: HIR_INT(12),
      }),
      HIR_BINARY({
        name: 'a8',
        operator: '*',
        e1: HIR_VARIABLE('a7', HIR_INT_TYPE),
        e2: HIR_INT(7),
      }),
      HIR_BINARY({
        name: 'a9',
        operator: '/',
        e1: HIR_VARIABLE('a7', HIR_INT_TYPE),
        e2: HIR_ZERO,
      }),
      HIR_BINARY({
        name: 'a10',
        operator: '%',
        e1: HIR_VARIABLE('a7', HIR_INT_TYPE),
        e2: HIR_ZERO,
      }),
      HIR_CAST({
        name: 'ss',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('a3', HIR_INT_TYPE),
      }),
      HIR_RETURN(HIR_VARIABLE('a8', HIR_INT_TYPE)),
    ],
    `let i0: int = 6[2];
let b8: int = (i0: int) * (i0: int);
let a6: int = (i1: int) / 30;
let s: int = [0, (a6: int), 30];
fff(1, 0, 0, 0, 0, 0, 1);
let a9: int = 6 / 0;
let a10: int = 6 % 0;
let ss: int = 30;
return 42;`
  );
});

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statement 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b1', operator: '<', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b1', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
      }),
      HIR_BINARY({ name: 'b2', operator: '>', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b2', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
      }),
      HIR_BINARY({ name: 'b3', operator: '<=', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b3', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a1', type: HIR_INT_TYPE },
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a2', type: HIR_INT_TYPE },
          }),
        ],
        finalAssignment: {
          name: 'ma1',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
        },
      }),
      HIR_BINARY({ name: 'b4', operator: '>=', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b4', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a11', type: HIR_INT_TYPE },
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a22', type: HIR_INT_TYPE },
          }),
        ],
        finalAssignment: {
          name: 'ma2',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a11', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a22', HIR_INT_TYPE),
        },
      }),
      HIR_BINARY({
        name: 'r1',
        operator: '==',
        e1: HIR_VARIABLE('ma1', HIR_INT_TYPE),
        e2: HIR_VARIABLE('ma2', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        name: 'r2',
        operator: '!=',
        e1: HIR_ONE,
        e2: HIR_ZERO,
      }),
      HIR_BINARY({
        name: 'r3',
        operator: '^',
        e1: HIR_TRUE,
        e2: HIR_FALSE,
      }),
      HIR_BINARY({
        name: 'r4',
        operator: '!=',
        e1: HIR_ONE,
        e2: HIR_ZERO,
      }),
      HIR_BINARY({
        name: 'r5',
        operator: '==',
        e1: HIR_VARIABLE('r4', HIR_BOOL_TYPE),
        e2: HIR_VARIABLE('r2', HIR_BOOL_TYPE),
      }),
      HIR_RETURN(HIR_VARIABLE('r5', HIR_BOOL_TYPE)),
    ],
    `foo();
bar();
let a1: int = foo();
let a22: int = bar();
let r1: bool = (a1: int) == (a22: int);
return 1;`
  );
});

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statement 2/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({
        name: 'a0',
        operator: '+',
        e1: HIR_INT(3),
        e2: HIR_INT(3),
      }),
      HIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: HIR_INT(3),
        e2: HIR_INT(3),
      }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a0', HIR_INT_TYPE)],
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a1', HIR_INT_TYPE)],
          }),
        ],
      }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a0', HIR_INT_TYPE)],
            returnCollector: { name: 'a1', type: HIR_INT_TYPE },
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a1', HIR_INT_TYPE)],
            returnCollector: { name: 'a2', type: HIR_INT_TYPE },
          }),
        ],
        finalAssignment: {
          name: 'ma1',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
        },
      }),
      HIR_RETURN(HIR_VARIABLE('ma1', HIR_INT_TYPE)),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [],
        s2: [],
        finalAssignment: {
          name: 'ma2',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a0', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a0', HIR_INT_TYPE),
        },
      }),
      HIR_RETURN(HIR_VARIABLE('ma2', HIR_INT_TYPE)),
    ],
    `if (b: bool) {
  foo(6);
} else {
  bar(9);
}
let ma1: int;
if (b: bool) {
  let a1: int = foo(6);
  ma1 = 9;
} else {
  let a2: int = bar(9);
  ma1 = (a2: int);
}
return (ma1: int);
return 6;`
  );
});

it('optimizeHighIRStatementsByConditionalConstantPropagation works on switch statement.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({
        name: 'a0',
        operator: '+',
        e1: HIR_INT(3),
        e2: HIR_INT(3),
      }),
      HIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: HIR_INT(3),
        e2: HIR_INT(3),
      }),
      HIR_SWITCH({
        caseVariable: 'a',
        cases: [
          {
            caseNumber: 1,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a0', HIR_INT_TYPE)],
              }),
            ],
          },
          {
            caseNumber: 2,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a1', HIR_INT_TYPE)],
              }),
            ],
          },
        ],
      }),
      HIR_SWITCH({
        caseVariable: 'a',
        cases: [
          {
            caseNumber: 1,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a0', HIR_INT_TYPE)],
                returnCollector: { name: 'b1', type: HIR_INT_TYPE },
              }),
            ],
          },
          {
            caseNumber: 2,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('bar', HIR_INT_TYPE),
                functionArguments: [HIR_VARIABLE('a1', HIR_INT_TYPE)],
                returnCollector: { name: 'b2', type: HIR_INT_TYPE },
              }),
            ],
          },
        ],
        finalAssignment: {
          name: 'ma1',
          type: HIR_INT_TYPE,
          branchValues: [HIR_VARIABLE('b1', HIR_INT_TYPE), HIR_VARIABLE('b2', HIR_INT_TYPE)],
        },
      }),
      HIR_SWITCH({
        caseVariable: 'a',
        cases: [
          {
            caseNumber: 1,
            statements: [],
          },
          {
            caseNumber: 2,
            statements: [
              HIR_BINARY({
                name: 'a3',
                operator: '*',
                e1: HIR_VARIABLE('a0', HIR_INT_TYPE),
                e2: HIR_INT(1),
              }),
            ],
          },
        ],
        finalAssignment: {
          name: 'ma2',
          type: HIR_INT_TYPE,
          branchValues: [HIR_VARIABLE('a0', HIR_INT_TYPE), HIR_VARIABLE('a3', HIR_INT_TYPE)],
        },
      }),
      HIR_RETURN(HIR_VARIABLE('ma2', HIR_INT_TYPE)),
    ],
    `switch (a) {
  case 1: {
    foo(6);
  }
  case 2: {
    bar(9);
  }
}
let ma1: int;
switch (a) {
  case 1: {
    let b1: int = foo(6);
    ma1 = (b1: int);
  }
  case 2: {
    let b2: int = bar(9);
    ma1 = (b2: int);
  }
}
return 6;`
  );
});
