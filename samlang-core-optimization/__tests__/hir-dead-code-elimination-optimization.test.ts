import optimizeHighIRStatementsByDeadCodeElimination from '../hir-dead-code-elimination-optimization';

import {
  HighIRStatement,
  debugPrintHighIRStatement,
  HIR_TRUE,
  HIR_FALSE,
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
    optimizeHighIRStatementsByDeadCodeElimination(statements)
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

it('optimizeHighIRStatementsByDeadCodeElimination works on a series of simple statements 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'u1', operator: '/', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_BINARY({ name: 'u2', operator: '%', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_BINARY({ name: 'u3', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_BINARY({ name: 'p', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_INDEX_ACCESS({
        name: 'i',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('p', HIR_INT_TYPE),
        index: 3,
      }),
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_INT_TYPE,
        expressionList: [HIR_VARIABLE('p', HIR_INT_TYPE)],
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('ff', HIR_INT_TYPE),
        functionArguments: [HIR_VARIABLE('s', HIR_INT_TYPE)],
        returnType: HIR_INT_TYPE,
      }),
      HIR_CAST({
        name: 'ii',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('i', HIR_INT_TYPE),
      }),
      HIR_RETURN(HIR_VARIABLE('ii', HIR_INT_TYPE)),
    ],
    `let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let i: int = (p: int)[3];
let s: int = [(p: int)];
ff((s: int));
let ii: int = (i: int);
return (ii: int);`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on a series of simple statements 2/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'u1', operator: '/', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_BINARY({ name: 'u2', operator: '%', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_BINARY({ name: 'u3', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_BINARY({ name: 'p', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_INDEX_ACCESS({
        name: 'i',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('p', HIR_INT_TYPE),
        index: 3,
      }),
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_INT_TYPE,
        expressionList: [HIR_VARIABLE('p', HIR_INT_TYPE)],
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('ff', HIR_INT_TYPE),
        functionArguments: [],
        returnType: HIR_INT_TYPE,
      }),
    ],
    `let u1: int = 0 / 1;
let u2: int = 0 % 1;
ff();`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
          }),
        ],
        s1BreakValue: null,
        s2BreakValue: null,
        finalAssignments: [],
      }),
    ],
    `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 2/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
            returnCollector: 'a1',
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
            returnCollector: 'a2',
          }),
        ],
        s1BreakValue: null,
        s2BreakValue: null,
        finalAssignments: [
          {
            name: 'ma',
            type: HIR_INT_TYPE,
            branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
            branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
          },
        ],
      }),
      HIR_RETURN(HIR_VARIABLE('ma', HIR_INT_TYPE)),
    ],
    `let b: bool = 0 == 1;
let ma: int;
if (b: bool) {
  let a1: int = s1();
  ma = (a1: int);
} else {
  let a2: int = s1();
  ma = (a2: int);
}
return (ma: int);`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 3/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
          }),
        ],
        s1BreakValue: null,
        s2BreakValue: null,
        finalAssignments: [
          {
            name: 'ma',
            type: HIR_INT_TYPE,
            branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
            branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
          },
        ],
      }),
    ],
    `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 4/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
            returnCollector: 'a1',
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
            returnCollector: 'a2',
          }),
        ],
        s1BreakValue: null,
        s2BreakValue: null,
        finalAssignments: [
          {
            name: 'ma',
            type: HIR_INT_TYPE,
            branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
            branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
          },
        ],
      }),
    ],
    `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 5/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [],
        s2: [],
        s1BreakValue: null,
        s2BreakValue: null,
        finalAssignments: [],
      }),
    ],
    ``
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on switch statements 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_SWITCH({
        caseVariable: 'b',
        cases: [
          {
            caseNumber: 0,
            statements: [HIR_BINARY({ name: 'c', operator: '==', e1: HIR_ZERO, e2: HIR_ONE })],
            breakValue: null,
          },
          {
            caseNumber: 1,
            statements: [HIR_BINARY({ name: 'd', operator: '==', e1: HIR_ZERO, e2: HIR_ONE })],
            breakValue: null,
          },
        ],
        finalAssignments: [],
      }),
    ],
    ``
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on switch statements 2/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_SWITCH({
        caseVariable: 'b',
        cases: [
          {
            caseNumber: 0,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
                functionArguments: [],
                returnType: HIR_INT_TYPE,
                returnCollector: 'a1',
              }),
            ],
            breakValue: null,
          },
          {
            caseNumber: 1,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('s2', HIR_INT_TYPE),
                functionArguments: [],
                returnType: HIR_INT_TYPE,
                returnCollector: 'a2',
              }),
            ],
            breakValue: null,
          },
        ],
        finalAssignments: [
          {
            name: 'ma',
            type: HIR_INT_TYPE,
            branchValues: [HIR_VARIABLE('a1', HIR_INT_TYPE), HIR_VARIABLE('a2', HIR_INT_TYPE)],
          },
        ],
      }),
    ],
    `let b: bool = 0 == 1;
switch (b) {
  case 0: {
    s1();
  }
  case 1: {
    s2();
  }
}`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on switch statements 3/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_SWITCH({
        caseVariable: 'b',
        cases: [
          {
            caseNumber: 0,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
                functionArguments: [],
                returnType: HIR_INT_TYPE,
                returnCollector: 'a1',
              }),
            ],
            breakValue: null,
          },
          {
            caseNumber: 1,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('s2', HIR_INT_TYPE),
                functionArguments: [],
                returnType: HIR_INT_TYPE,
                returnCollector: 'a2',
              }),
            ],
            breakValue: null,
          },
        ],
        finalAssignments: [
          {
            name: 'ma',
            type: HIR_INT_TYPE,
            branchValues: [HIR_VARIABLE('a1', HIR_INT_TYPE), HIR_VARIABLE('a2', HIR_INT_TYPE)],
          },
        ],
      }),
      HIR_RETURN(HIR_VARIABLE('ma', HIR_INT_TYPE)),
    ],
    `let b: bool = 0 == 1;
let ma: int;
switch (b) {
  case 0: {
    let a1: int = s1();
    ma = (a1: int);
  }
  case 1: {
    let a2: int = s2();
    ma = (a2: int);
  }
}
return (ma: int);`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 1/n.', () => {
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
            s1BreakValue: null,
            s2BreakValue: null,
            finalAssignments: [
              {
                name: '_tmp_n',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('n', HIR_INT_TYPE),
                branch2Value: HIR_VARIABLE('s2_n', HIR_INT_TYPE),
              },
            ],
          }),
        ],
      }),
    ],
    `let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let _tmp_n: int;
  if (is_zero: bool) {
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 2/n.', () => {
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
          {
            name: 'n1',
            type: HIR_INT_TYPE,
            initialValue: HIR_INT(10),
            loopValue: HIR_INT(20),
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
            s1BreakValue: HIR_ZERO,
            s2BreakValue: null,
            finalAssignments: [
              {
                name: '_tmp_n',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('n', HIR_INT_TYPE),
                branch2Value: HIR_VARIABLE('s2_n', HIR_INT_TYPE),
              },
            ],
          }),
        ],
        breakCollector: { name: 'v', type: HIR_INT_TYPE },
      }),
    ],
    `let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let _tmp_n: int;
  if (is_zero: bool) {
    undefined = 0;
    break;
  } else {
    let s2_n: int = (n: int) + -1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}`
  );
});

it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 3/n.', () => {
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
            s1BreakValue: null,
            s2BreakValue: HIR_ZERO,
            finalAssignments: [
              {
                name: '_tmp_n',
                type: HIR_INT_TYPE,
                branch1Value: HIR_VARIABLE('n', HIR_INT_TYPE),
                branch2Value: HIR_VARIABLE('s2_n', HIR_INT_TYPE),
              },
            ],
          }),
        ],
        breakCollector: { name: 'v', type: HIR_INT_TYPE },
      }),
      HIR_RETURN(HIR_VARIABLE('v', HIR_INT_TYPE)),
    ],
    `let n: int = 10;
let v: int;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let _tmp_n: int;
  if (is_zero: bool) {
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    v = 0;
    break;
  }
  n = (_tmp_n: int);
}
return (v: int);`
  );
});
