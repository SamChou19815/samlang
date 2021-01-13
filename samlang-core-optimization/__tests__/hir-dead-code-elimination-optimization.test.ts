import optimizeHighIRStatementsByDeadCodeElimination from '../hir-dead-code-elimination-optimization';

import {
  HighIRStatement,
  debugPrintHighIRStatement,
  HIR_ZERO,
  HIR_ONE,
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
} from 'samlang-core-ast/hir-expressions';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const assertCorrectlyOptimized = (statements: HighIRStatement[], expected: string): void => {
  expect(
    optimizeHighIRStatementsByDeadCodeElimination(statements)
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

it('optimizeHighIRStatementsByConditionalConstantPropagation works on a series of simple statements 1/n.', () => {
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

it('optimizeHighIRStatementsByConditionalConstantPropagation works on a series of simple statements 2/n.', () => {
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
      }),
    ],
    `let u1: int = 0 / 1;
let u2: int = 0 % 1;
ff();`
  );
});

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statements 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
          }),
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

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statements 2/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a1', type: HIR_INT_TYPE },
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a2', type: HIR_INT_TYPE },
          }),
        ],
        finalAssignment: {
          name: 'ma',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
        },
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

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statements 3/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
        finalAssignment: {
          name: 'ma',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
        },
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

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statements 4/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a1', type: HIR_INT_TYPE },
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('s1', HIR_INT_TYPE),
            functionArguments: [],
            returnCollector: { name: 'a2', type: HIR_INT_TYPE },
          }),
        ],
        finalAssignment: {
          name: 'ma',
          type: HIR_INT_TYPE,
          branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
          branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
        },
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

it('optimizeHighIRStatementsByConditionalConstantPropagation works on if-else statements 5/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_IF_ELSE({ booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE), s1: [], s2: [] }),
    ],
    ``
  );
});

it('optimizeHighIRStatementsByConditionalConstantPropagation works on switch statements 1/n.', () => {
  assertCorrectlyOptimized(
    [
      HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
      HIR_SWITCH({
        caseVariable: 'b',
        cases: [
          {
            caseNumber: 0,
            statements: [HIR_BINARY({ name: 'c', operator: '==', e1: HIR_ZERO, e2: HIR_ONE })],
          },
          {
            caseNumber: 1,
            statements: [HIR_BINARY({ name: 'd', operator: '==', e1: HIR_ZERO, e2: HIR_ONE })],
          },
        ],
      }),
    ],
    ``
  );
});

it('optimizeHighIRStatementsByConditionalConstantPropagation works on switch statements 2/n.', () => {
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
                returnCollector: { name: 'a1', type: HIR_INT_TYPE },
              }),
            ],
          },
          {
            caseNumber: 1,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('s2', HIR_INT_TYPE),
                functionArguments: [],
                returnCollector: { name: 'a2', type: HIR_INT_TYPE },
              }),
            ],
          },
        ],
        finalAssignment: {
          name: 'ma',
          type: HIR_INT_TYPE,
          branchValues: [HIR_VARIABLE('a1', HIR_INT_TYPE), HIR_VARIABLE('a2', HIR_INT_TYPE)],
        },
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

it('optimizeHighIRStatementsByConditionalConstantPropagation works on switch statements 3/n.', () => {
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
                returnCollector: { name: 'a1', type: HIR_INT_TYPE },
              }),
            ],
          },
          {
            caseNumber: 1,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('s2', HIR_INT_TYPE),
                functionArguments: [],
                returnCollector: { name: 'a2', type: HIR_INT_TYPE },
              }),
            ],
          },
        ],
        finalAssignment: {
          name: 'ma',
          type: HIR_INT_TYPE,
          branchValues: [HIR_VARIABLE('a1', HIR_INT_TYPE), HIR_VARIABLE('a2', HIR_INT_TYPE)],
        },
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
