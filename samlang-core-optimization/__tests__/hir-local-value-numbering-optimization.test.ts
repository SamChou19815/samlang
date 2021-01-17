import optimizeHighIRStatementsByLocalValueNumbering from '../hir-local-value-numbering-optimization';

import {
  HighIRStatement,
  debugPrintHighIRStatement,
  HIR_FALSE,
  HIR_TRUE,
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
  HIR_WHILE,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const assertCorrectlyOptimized = (statements: HighIRStatement[], expected: string): void => {
  expect(
    optimizeHighIRStatementsByLocalValueNumbering(statements)
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

it('optimizeHighIRStatementsByLocalValueNumbering works on a series of simple statements', () => {
  assertCorrectlyOptimized(
    [
      HIR_INDEX_ACCESS({
        name: 'i0',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_INDEX_ACCESS({
        name: 'i1',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_BINARY({
        name: 'b0',
        operator: '+',
        e1: HIR_VARIABLE('i1', HIR_INT_TYPE),
        e2: HIR_INT(3),
      }),
      HIR_BINARY({
        name: 'b1',
        operator: '+',
        e1: HIR_VARIABLE('i0', HIR_INT_TYPE),
        e2: HIR_INT(3),
      }),
      HIR_BINARY({
        name: 'b3',
        operator: '+',
        e1: HIR_VARIABLE('i1', HIR_INT_TYPE),
        e2: HIR_VARIABLE('b1', HIR_INT_TYPE),
      }),
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_INT_TYPE,
        expressionList: [
          HIR_VARIABLE('i1', HIR_INT_TYPE),
          HIR_VARIABLE('b1', HIR_INT_TYPE),
          HIR_VARIABLE('b3', HIR_INT_TYPE),
        ],
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
        functionArguments: [
          HIR_VARIABLE('i1', HIR_INT_TYPE),
          HIR_VARIABLE('b1', HIR_INT_TYPE),
          HIR_VARIABLE('b3', HIR_INT_TYPE),
        ],
        returnType: HIR_INT_TYPE,
      }),
      HIR_CAST({
        name: 'ss',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('b3', HIR_INT_TYPE),
      }),
      HIR_RETURN(HIR_VARIABLE('ss', HIR_INT_TYPE)),
    ],
    `let i0: int = (a: int)[2];
let b0: int = (i0: int) + 3;
let b3: int = (i0: int) + (b0: int);
let s: int = [(i0: int), (b0: int), (b3: int)];
fff((i0: int), (b0: int), (b3: int));
let ss: int = (b3: int);
return (ss: int);`
  );
});

it('optimizeHighIRStatementsByLocalValueNumbering works on if-else 1/n', () => {
  assertCorrectlyOptimized(
    [
      HIR_INDEX_ACCESS({
        name: 'i0',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_IF_ELSE({
        booleanExpression: HIR_ZERO,
        s1: [
          HIR_INDEX_ACCESS({
            name: 'i1',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            index: 2,
          }),
          HIR_INDEX_ACCESS({
            name: 'i3',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('i1', HIR_INT_TYPE),
            index: 1,
          }),
        ],
        s2: [
          HIR_INDEX_ACCESS({
            name: 'i2',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            index: 2,
          }),
          HIR_INDEX_ACCESS({
            name: 'i4',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('i2', HIR_INT_TYPE),
            index: 1,
          }),
        ],
        finalAssignments: [],
      }),
      HIR_INDEX_ACCESS({
        name: 'i5',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('i0', HIR_INT_TYPE),
        index: 1,
      }),
    ],
    `let i0: int = (a: int)[2];
if 0 {
  let i3: int = (i0: int)[1];
} else {
  let i4: int = (i0: int)[1];
}
let i5: int = (i0: int)[1];`
  );
});

it('optimizeHighIRStatementsByLocalValueNumbering works on if-else 2/n', () => {
  assertCorrectlyOptimized(
    [
      HIR_INDEX_ACCESS({
        name: 'i0',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_IF_ELSE({
        booleanExpression: HIR_ZERO,
        s1: [
          HIR_INDEX_ACCESS({
            name: 'i1',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            index: 2,
          }),
          HIR_INDEX_ACCESS({
            name: 'i3',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('i1', HIR_INT_TYPE),
            index: 1,
          }),
        ],
        s2: [
          HIR_INDEX_ACCESS({
            name: 'i2',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
            index: 2,
          }),
          HIR_INDEX_ACCESS({
            name: 'i4',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('i2', HIR_INT_TYPE),
            index: 1,
          }),
        ],
        finalAssignments: [
          {
            name: 'bar',
            type: HIR_INT_TYPE,
            branch1Value: HIR_VARIABLE('i1', HIR_INT_TYPE),
            branch2Value: HIR_VARIABLE('i2', HIR_INT_TYPE),
          },
        ],
      }),
    ],
    `let i0: int = (a: int)[2];
let bar: int;
if 0 {
  let i3: int = (i0: int)[1];
  bar = (i0: int);
} else {
  let i4: int = (i0: int)[1];
  bar = (i0: int);
}`
  );
});

it('optimizeHighIRStatementsByLocalValueNumbering works on switch 1/n', () => {
  assertCorrectlyOptimized(
    [
      HIR_INDEX_ACCESS({
        name: 'i0',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_SWITCH({
        caseVariable: 'cc',
        cases: [
          {
            caseNumber: 0,
            statements: [
              HIR_INDEX_ACCESS({
                name: 'i1',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
                index: 2,
              }),
              HIR_INDEX_ACCESS({
                name: 'i3',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('i1', HIR_INT_TYPE),
                index: 1,
              }),
            ],
          },
          {
            caseNumber: 1,
            statements: [
              HIR_INDEX_ACCESS({
                name: 'i2',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
                index: 2,
              }),
              HIR_INDEX_ACCESS({
                name: 'i4',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('i2', HIR_INT_TYPE),
                index: 1,
              }),
            ],
          },
        ],
        finalAssignments: [],
      }),
      HIR_INDEX_ACCESS({
        name: 'i5',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('i0', HIR_INT_TYPE),
        index: 1,
      }),
    ],
    `let i0: int = (a: int)[2];
switch (cc) {
  case 0: {
    let i3: int = (i0: int)[1];
  }
  case 1: {
    let i4: int = (i0: int)[1];
  }
}
let i5: int = (i0: int)[1];`
  );
});

it('optimizeHighIRStatementsByLocalValueNumbering works on switch 2/n', () => {
  assertCorrectlyOptimized(
    [
      HIR_INDEX_ACCESS({
        name: 'i0',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
        index: 2,
      }),
      HIR_SWITCH({
        caseVariable: 'cc',
        cases: [
          {
            caseNumber: 0,
            statements: [
              HIR_INDEX_ACCESS({
                name: 'i1',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
                index: 2,
              }),
              HIR_INDEX_ACCESS({
                name: 'i3',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('i1', HIR_INT_TYPE),
                index: 1,
              }),
            ],
          },
          {
            caseNumber: 1,
            statements: [
              HIR_INDEX_ACCESS({
                name: 'i2',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
                index: 2,
              }),
              HIR_INDEX_ACCESS({
                name: 'i4',
                type: HIR_INT_TYPE,
                pointerExpression: HIR_VARIABLE('i2', HIR_INT_TYPE),
                index: 1,
              }),
            ],
          },
        ],
        finalAssignments: [
          {
            name: 'bar',
            type: HIR_INT_TYPE,
            branchValues: [HIR_VARIABLE('i1', HIR_INT_TYPE), HIR_VARIABLE('i2', HIR_INT_TYPE)],
          },
        ],
      }),
    ],
    `let i0: int = (a: int)[2];
let bar: int;
switch (cc) {
  case 0: {
    let i3: int = (i0: int)[1];
    bar = (i0: int);
  }
  case 1: {
    let i4: int = (i0: int)[1];
    bar = (i0: int);
  }
}`
  );
});

it('optimizeHighIRStatementsByLocalValueNumbering works on while statement 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: HIR_INT_TYPE,
            initialValue: HIR_INT(10),
            loopValue: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
          },
        ],
        statements: [
          HIR_BINARY({
            name: 'is_zero',
            operator: '==',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('is_zero', HIR_BOOL_TYPE),
            s1: [],
            s2: [
              HIR_BINARY({
                name: 's2_n',
                operator: '-',
                e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                e2: HIR_ONE,
              }),
            ],
            finalAssignments: [
              { name: 'c', type: HIR_INT_TYPE, branch1Value: HIR_FALSE, branch2Value: HIR_TRUE },
              {
                name: '_tmp_n',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('n', HIR_INT_TYPE),
                branch2Value: HIR_VARIABLE('s2_n', HIR_INT_TYPE),
              },
            ],
          }),
        ],
        conditionValue: HIR_VARIABLE('c', HIR_INT_TYPE),
      }),
    ],
    `let n: int = 10;
do {
  let is_zero: bool = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: bool) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
} while ((c: int));`
  );
});

it('optimizeHighIRStatementsByLocalValueNumbering works on while statement 2/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: HIR_INT_TYPE,
            initialValue: HIR_INT(10),
            loopValue: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
          },
        ],
        statements: [
          HIR_BINARY({
            name: 'is_zero',
            operator: '==',
            e1: HIR_VARIABLE('n', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('is_zero', HIR_BOOL_TYPE),
            s1: [],
            s2: [
              HIR_BINARY({
                name: 's2_n',
                operator: '-',
                e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                e2: HIR_ONE,
              }),
            ],
            finalAssignments: [
              { name: 'c', type: HIR_INT_TYPE, branch1Value: HIR_FALSE, branch2Value: HIR_TRUE },
              {
                name: '_tmp_n',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('n', HIR_INT_TYPE),
                branch2Value: HIR_VARIABLE('s2_n', HIR_INT_TYPE),
              },
            ],
          }),
        ],
        conditionValue: HIR_VARIABLE('c', HIR_INT_TYPE),
        returnAssignment: {
          name: 'v',
          type: HIR_INT_TYPE,
          value: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
        },
      }),
      HIR_RETURN(HIR_VARIABLE('v', HIR_INT_TYPE)),
    ],
    `let n: int = 10;
let v: int;
do {
  let is_zero: bool = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: bool) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
  v = (_tmp_n: int);
} while ((c: int));
return (v: int);`
  );
});
