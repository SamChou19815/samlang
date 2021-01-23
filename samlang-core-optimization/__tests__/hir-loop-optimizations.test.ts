import optimizeHighIRStatementsWithAllLoopOptimizations, {
  optimizeHighIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING,
} from '../hir-loop-optimizations';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  HighIRStatement,
  HighIRWhileStatement,
  debugPrintHighIRStatement,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_CAST,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const assertOptimizeHighIRWhileStatementWithAllLoopOptimizations = (
  highIRWhileStatement: HighIRWhileStatement,
  expected: string
): void => {
  expect(
    optimizeHighIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING(
      highIRWhileStatement,
      new OptimizationResourceAllocator()
    )
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

const assertOptimizeHighIRStatementsWithAllLoopOptimizations = (
  statements: readonly HighIRStatement[],
  expected: string
): void => {
  expect(
    optimizeHighIRStatementsWithAllLoopOptimizations(
      statements,
      new OptimizationResourceAllocator()
    )
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

const VARIABLE_I = HIR_VARIABLE('i', HIR_INT_TYPE);
const VARIABLE_J = HIR_VARIABLE('j', HIR_INT_TYPE);
const VARIABLE_TMP_I = HIR_VARIABLE('tmp_i', HIR_INT_TYPE);
const VARIABLE_TMP_J = HIR_VARIABLE('tmp_j', HIR_INT_TYPE);
const VARIABLE_TMP_K = HIR_VARIABLE('tmp_k', HIR_INT_TYPE);

const optimizableWhile1 = HIR_WHILE({
  loopVariables: [
    { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_I },
    { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_J },
  ],
  statements: [
    HIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: HIR_INT(10) }),
    HIR_SINGLE_IF({
      booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
      invertCondition: false,
      statements: [HIR_BREAK(VARIABLE_J)],
    }),
    HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
    HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(10) }),
  ],
  breakCollector: { name: 'bc', type: HIR_INT_TYPE },
});

const optimizableWhile2 = HIR_WHILE({
  loopVariables: [
    { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_I },
    { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_J },
  ],
  statements: [
    HIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: HIR_INT(10) }),
    HIR_SINGLE_IF({
      booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
      invertCondition: false,
      statements: [HIR_BREAK(VARIABLE_J)],
    }),
    HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
    HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: HIR_INT(10) }),
  ],
  breakCollector: { name: 'bc', type: HIR_INT_TYPE },
});

const optimizableWhile3 = HIR_WHILE({
  loopVariables: [
    { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_I },
    { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_J },
    { name: 'k', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_K },
  ],
  statements: [
    HIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: HIR_INT(10) }),
    HIR_SINGLE_IF({
      booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
      invertCondition: false,
      statements: [HIR_BREAK(VARIABLE_J)],
    }),
    HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
    HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: HIR_INT(9) }),
    HIR_BINARY({ name: 'tmp_k', operator: '+', e1: VARIABLE_TMP_I, e2: HIR_INT(9) }),
  ],
  breakCollector: { name: 'bc', type: HIR_INT_TYPE },
});

it('optimizeHighIRWhileStatementWithAllLoopOptimizations works', () => {
  assertOptimizeHighIRWhileStatementWithAllLoopOptimizations(
    HIR_WHILE({
      loopVariables: [],
      statements: [HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
    }),
    'let a: int = 0;\nwhile (true) {\n}'
  );

  assertOptimizeHighIRWhileStatementWithAllLoopOptimizations(
    optimizableWhile1,
    'let _loop_0: int = 10 * 10;\nlet bc: int = (_loop_0: int) + 0;'
  );

  assertOptimizeHighIRWhileStatementWithAllLoopOptimizations(
    optimizableWhile2,
    `let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 11;
let _loop_2: int = 10 * 1;
let _loop_3: int = (_loop_2: int) + 11;
let j: int = 0;
let tmp_j: int = (_loop_1: int);
let bc: int;
while (true) {
  let _loop_5: bool = (tmp_j: int) >= (_loop_3: int);
  if (_loop_5: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_loop_4: int);
}`
  );

  assertOptimizeHighIRWhileStatementWithAllLoopOptimizations(
    optimizableWhile3,
    `let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 10;
let _loop_2: int = 1 * 0;
let _loop_3: int = (_loop_2: int) + 10;
let j: int = 0;
let k: int = 0;
let i: int = 0;
let tmp_j: int = (_loop_1: int);
let tmp_k: int = (_loop_3: int);
let bc: int;
while (true) {
  let _loop_7: bool = (i: int) >= 10;
  if (_loop_7: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (i: int) + 1;
  let _loop_5: int = (tmp_j: int) + 1;
  let _loop_6: int = (tmp_k: int) + 1;
  j = (tmp_j: int);
  k = (tmp_k: int);
  i = (_loop_4: int);
  tmp_j = (_loop_5: int);
  tmp_k = (_loop_6: int);
}`
  );

  assertOptimizeHighIRWhileStatementWithAllLoopOptimizations(
    HIR_WHILE({
      loopVariables: [
        { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_I },
        { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_J },
      ],
      statements: [
        HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_INT(10) }),
        HIR_SINGLE_IF({
          booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
          invertCondition: false,
          statements: [HIR_BREAK(VARIABLE_J)],
        }),
        HIR_BINARY({
          name: 'tmp_i',
          operator: '+',
          e1: VARIABLE_I,
          e2: HIR_VARIABLE('a', HIR_INT_TYPE),
        }),
        HIR_BINARY({
          name: 'tmp_j',
          operator: '*',
          e1: VARIABLE_I,
          e2: HIR_INT(2),
        }),
      ],
      breakCollector: { name: 'bc', type: HIR_INT_TYPE },
    }),
    `let j: int = 0;
let i: int = 0;
let bc: int;
while (true) {
  let _loop_1: bool = (i: int) < 10;
  if (_loop_1: bool) {
    bc = (j: int);
    break;
  }
  let _loop_0: int = (i: int) + (a: int);
  let _loop_2: int = (i: int) * 2;
  let tmp_j: int = (_loop_2: int) + 0;
  j = (tmp_j: int);
  i = (_loop_0: int);
}`
  );

  assertOptimizeHighIRWhileStatementWithAllLoopOptimizations(
    HIR_WHILE({
      loopVariables: [
        { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_I },
        { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_J },
      ],
      statements: [
        HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_INT(10) }),
        HIR_SINGLE_IF({
          booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
          invertCondition: false,
          statements: [HIR_BREAK(VARIABLE_J)],
        }),
        HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
        HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: HIR_INT(10) }),
      ],
    }),
    `let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 11;
let _loop_2: int = 10 * 1;
let _loop_3: int = (_loop_2: int) + 11;
let j: int = 0;
let tmp_j: int = (_loop_1: int);
while (true) {
  let _loop_5: bool = (tmp_j: int) >= (_loop_3: int);
  if (_loop_5: bool) {
    undefined = 0;
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_loop_4: int);
}`
  );
});

it('optimizeHighIRStatementsWithAllLoopOptimizations works', () => {
  assertOptimizeHighIRStatementsWithAllLoopOptimizations(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_ZERO,
        s1: [
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: true,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
        ],
        s2: [
          HIR_BINARY({
            name: 'tmp_j',
            operator: '*',
            e1: VARIABLE_I,
            e2: HIR_INT(2),
          }),
        ],
        finalAssignments: [],
      }),
    ],
    'let tmp_j: int = (i: int) * 2;'
  );

  assertOptimizeHighIRStatementsWithAllLoopOptimizations(
    [optimizableWhile1, HIR_RETURN(HIR_VARIABLE('bc', HIR_INT_TYPE))],
    'return 100;'
  );

  assertOptimizeHighIRStatementsWithAllLoopOptimizations(
    [optimizableWhile2, HIR_RETURN(HIR_VARIABLE('bc', HIR_INT_TYPE))],
    `let j: int = 16;
let tmp_j: int = 17;
let bc: int;
while (true) {
  let _loop_5: bool = (tmp_j: int) >= 21;
  if (_loop_5: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_loop_4: int);
}
return (bc: int);`
  );

  assertOptimizeHighIRStatementsWithAllLoopOptimizations(
    [optimizableWhile3, HIR_RETURN(HIR_VARIABLE('bc', HIR_INT_TYPE))],
    `let j: int = 15;
let k: int = 15;
let i: int = 6;
let tmp_j: int = 16;
let tmp_k: int = 16;
let bc: int;
while (true) {
  let _loop_7: bool = (i: int) >= 10;
  if (_loop_7: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (i: int) + 1;
  let _loop_5: int = (tmp_j: int) + 1;
  let _loop_6: int = (tmp_k: int) + 1;
  j = (tmp_j: int);
  k = (tmp_k: int);
  i = (_loop_4: int);
  tmp_j = (_loop_5: int);
  tmp_k = (_loop_6: int);
}
return (bc: int);`
  );

  assertOptimizeHighIRStatementsWithAllLoopOptimizations(
    [
      HIR_WHILE({
        loopVariables: [
          { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_INT(4), loopValue: VARIABLE_TMP_I },
          { name: 'acc', type: HIR_INT_TYPE, initialValue: HIR_ONE, loopValue: VARIABLE_TMP_J },
        ],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_INT(1) }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_BREAK(HIR_VARIABLE('acc', HIR_INT_TYPE))],
          }),
          HIR_BINARY({
            name: 'tmp_i',
            operator: '+',
            e1: VARIABLE_I,
            e2: HIR_INT(-1),
          }),
          HIR_BINARY({
            name: 'tmp_j',
            operator: '*',
            e1: VARIABLE_I,
            e2: HIR_VARIABLE('acc', HIR_INT_TYPE),
          }),
        ],
        breakCollector: { name: 'bc', type: HIR_INT_TYPE },
      }),
      HIR_RETURN(HIR_VARIABLE('bc', HIR_INT_TYPE)),
    ],
    'return 24;'
  );

  assertOptimizeHighIRStatementsWithAllLoopOptimizations(
    [
      HIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: HIR_INT_TYPE,
            initialValue: HIR_VARIABLE('init_i', HIR_INT_TYPE),
            loopValue: VARIABLE_TMP_I,
          },
        ],
        statements: [
          HIR_BINARY({
            name: 'cc',
            operator: '<',
            e1: VARIABLE_I,
            e2: HIR_VARIABLE('L', HIR_INT_TYPE),
          }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: true,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
          HIR_BINARY({ name: 't', operator: '*', e1: VARIABLE_I, e2: HIR_INT(3) }),
          HIR_BINARY({
            name: 'j',
            operator: '+',
            e1: HIR_VARIABLE('t', HIR_INT_TYPE),
            e2: HIR_VARIABLE('a', HIR_INT_TYPE),
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO,
            functionArguments: [VARIABLE_J],
            returnType: HIR_INT_TYPE,
          }),
          HIR_BINARY({
            name: 'tmp_i',
            operator: '+',
            e1: VARIABLE_I,
            e2: HIR_INT(2),
          }),
        ],
      }),
    ],
    `let _loop_0: int = (init_i: int) * 3;
let _loop_2: int = (init_i: int) * 3;
let _loop_3: int = (a: int) + (_loop_2: int);
let i: int = (init_i: int);
let t: int = (_loop_0: int);
let j: int = (_loop_3: int);
while (true) {
  let _loop_7: bool = (L: int) <= (i: int);
  if (_loop_7: bool) {
    undefined = 0;
    break;
  }
  0((j: int));
  let _loop_4: int = (i: int) + 2;
  let _loop_5: int = (t: int) + 6;
  let _loop_6: int = (j: int) + 6;
  i = (_loop_4: int);
  t = (_loop_5: int);
  j = (_loop_6: int);
}`
  );
});
