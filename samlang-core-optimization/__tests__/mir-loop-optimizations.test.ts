import {
  MidIRExpression,
  MidIRStatement,
  MidIRWhileStatement,
  debugPrintMidIRExpression,
  debugPrintMidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_CAST,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import optimizeMidIRFunctionWithAllLoopOptimizations, {
  optimizeMidIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING,
} from '../mir-loop-optimizations';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

const assertOptimizeMidIRWhileStatementWithAllLoopOptimizations = (
  midIRWhileStatement: MidIRWhileStatement,
  expected: string
): void => {
  expect(
    optimizeMidIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING(
      midIRWhileStatement,
      new OptimizationResourceAllocator()
    )
      .map((it) => debugPrintMidIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

const assertOptimizeMidIRStatementsWithAllLoopOptimizations = (
  statements: MidIRStatement[],
  returnValue: MidIRExpression,
  expected: string
): void => {
  const { body, returnValue: optimizedReturnValue } = optimizeMidIRFunctionWithAllLoopOptimizations(
    {
      name: '',
      parameters: [],
      type: { __type__: 'FunctionType', argumentTypes: [], returnType: MIR_INT_TYPE },
      body: statements,
      returnValue,
    },
    new OptimizationResourceAllocator()
  );

  expect(
    `${body.map((it) => debugPrintMidIRStatement(it)).join('\n')}\n` +
      `return ${debugPrintMidIRExpression(optimizedReturnValue)};`
  ).toBe(expected);
};

const VARIABLE_I = MIR_VARIABLE('i', MIR_INT_TYPE);
const VARIABLE_J = MIR_VARIABLE('j', MIR_INT_TYPE);
const VARIABLE_TMP_I = MIR_VARIABLE('tmp_i', MIR_INT_TYPE);
const VARIABLE_TMP_J = MIR_VARIABLE('tmp_j', MIR_INT_TYPE);
const VARIABLE_TMP_K = MIR_VARIABLE('tmp_k', MIR_INT_TYPE);

const optimizableWhile1 = MIR_WHILE({
  loopVariables: [
    { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_I },
    { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_J },
  ],
  statements: [
    MIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: MIR_INT(10) }),
    MIR_SINGLE_IF({
      booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
      invertCondition: false,
      statements: [MIR_BREAK(VARIABLE_J)],
    }),
    MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
    MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: MIR_INT(10) }),
  ],
  breakCollector: { name: 'bc', type: MIR_INT_TYPE },
});

const optimizableWhile2 = MIR_WHILE({
  loopVariables: [
    { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_I },
    { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_J },
  ],
  statements: [
    MIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: MIR_INT(10) }),
    MIR_SINGLE_IF({
      booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
      invertCondition: false,
      statements: [MIR_BREAK(VARIABLE_J)],
    }),
    MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
    MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: MIR_INT(10) }),
  ],
  breakCollector: { name: 'bc', type: MIR_INT_TYPE },
});

const optimizableWhile3 = MIR_WHILE({
  loopVariables: [
    { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_I },
    { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_J },
    { name: 'k', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_K },
  ],
  statements: [
    MIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: MIR_INT(10) }),
    MIR_SINGLE_IF({
      booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
      invertCondition: false,
      statements: [MIR_BREAK(VARIABLE_J)],
    }),
    MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
    MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: MIR_INT(9) }),
    MIR_BINARY({ name: 'tmp_k', operator: '+', e1: VARIABLE_TMP_I, e2: MIR_INT(9) }),
  ],
  breakCollector: { name: 'bc', type: MIR_INT_TYPE },
});

it('optimizeMidIRWhileStatementWithAllLoopOptimizations works', () => {
  assertOptimizeMidIRWhileStatementWithAllLoopOptimizations(
    MIR_WHILE({
      loopVariables: [],
      statements: [MIR_CAST({ name: 'a', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
    }),
    'let a: int = 0;\nwhile (true) {\n}'
  );

  assertOptimizeMidIRWhileStatementWithAllLoopOptimizations(
    optimizableWhile1,
    'let _loop_0: int = 10 * 10;\nlet bc: int = (_loop_0: int) + 0;'
  );

  assertOptimizeMidIRWhileStatementWithAllLoopOptimizations(
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

  assertOptimizeMidIRWhileStatementWithAllLoopOptimizations(
    optimizableWhile3,
    `let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 10;
let _loop_2: int = 1 * 0;
let _loop_3: int = (_loop_2: int) + 10;
let j: int = 0;
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
  i = (_loop_4: int);
  tmp_j = (_loop_5: int);
  tmp_k = (_loop_6: int);
}`
  );

  assertOptimizeMidIRWhileStatementWithAllLoopOptimizations(
    MIR_WHILE({
      loopVariables: [
        { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_I },
        { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_J },
      ],
      statements: [
        MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_INT(10) }),
        MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
          invertCondition: false,
          statements: [MIR_BREAK(VARIABLE_J)],
        }),
        MIR_BINARY({
          name: 'tmp_i',
          operator: '+',
          e1: VARIABLE_I,
          e2: MIR_VARIABLE('a', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_j',
          operator: '*',
          e1: VARIABLE_I,
          e2: MIR_INT(2),
        }),
      ],
      breakCollector: { name: 'bc', type: MIR_INT_TYPE },
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

  assertOptimizeMidIRWhileStatementWithAllLoopOptimizations(
    MIR_WHILE({
      loopVariables: [
        { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_I },
        { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_J },
      ],
      statements: [
        MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_INT(10) }),
        MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
          invertCondition: false,
          statements: [MIR_BREAK(VARIABLE_J)],
        }),
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: MIR_INT(10) }),
      ],
    }),
    `let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 11;
let _loop_2: int = 10 * 1;
let _loop_3: int = (_loop_2: int) + 11;
let tmp_j: int = (_loop_1: int);
while (true) {
  let _loop_5: bool = (tmp_j: int) >= (_loop_3: int);
  if (_loop_5: bool) {
    undefined = 0;
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  tmp_j = (_loop_4: int);
}`
  );
});

it('optimizeMidIRStatementsWithAllLoopOptimizations works', () => {
  assertOptimizeMidIRStatementsWithAllLoopOptimizations(
    [
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [
          MIR_SINGLE_IF({
            booleanExpression: MIR_ZERO,
            invertCondition: true,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
        ],
        s2: [
          MIR_BINARY({
            name: 'tmp_j',
            operator: '*',
            e1: VARIABLE_I,
            e2: MIR_INT(2),
          }),
        ],
        finalAssignments: [],
      }),
    ],
    MIR_ZERO,
    'let tmp_j: int = (i: int) * 2;\nreturn 0;'
  );

  assertOptimizeMidIRStatementsWithAllLoopOptimizations(
    [optimizableWhile1],
    MIR_VARIABLE('bc', MIR_INT_TYPE),
    '\nreturn 100;'
  );

  assertOptimizeMidIRStatementsWithAllLoopOptimizations(
    [optimizableWhile2],
    MIR_VARIABLE('bc', MIR_INT_TYPE),
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

  assertOptimizeMidIRStatementsWithAllLoopOptimizations(
    [optimizableWhile3],
    MIR_VARIABLE('bc', MIR_INT_TYPE),
    `let j: int = 15;
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
  i = (_loop_4: int);
  tmp_j = (_loop_5: int);
  tmp_k = (_loop_6: int);
}
return (bc: int);`
  );

  assertOptimizeMidIRStatementsWithAllLoopOptimizations(
    [
      MIR_WHILE({
        loopVariables: [
          { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_INT(4), loopValue: VARIABLE_TMP_I },
          { name: 'acc', type: MIR_INT_TYPE, initialValue: MIR_ONE, loopValue: VARIABLE_TMP_J },
        ],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_INT(1) }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_VARIABLE('acc', MIR_INT_TYPE))],
          }),
          MIR_BINARY({
            name: 'tmp_i',
            operator: '+',
            e1: VARIABLE_I,
            e2: MIR_INT(-1),
          }),
          MIR_BINARY({
            name: 'tmp_j',
            operator: '*',
            e1: VARIABLE_I,
            e2: MIR_VARIABLE('acc', MIR_INT_TYPE),
          }),
        ],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE },
      }),
    ],
    MIR_VARIABLE('bc', MIR_INT_TYPE),
    '\nreturn 24;'
  );

  assertOptimizeMidIRStatementsWithAllLoopOptimizations(
    [
      MIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: MIR_INT_TYPE,
            initialValue: MIR_VARIABLE('init_i', MIR_INT_TYPE),
            loopValue: VARIABLE_TMP_I,
          },
        ],
        statements: [
          MIR_BINARY({
            name: 'cc',
            operator: '<',
            e1: VARIABLE_I,
            e2: MIR_VARIABLE('L', MIR_INT_TYPE),
          }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: true,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
          MIR_BINARY({ name: 't', operator: '*', e1: VARIABLE_I, e2: MIR_INT(3) }),
          MIR_BINARY({
            name: 'j',
            operator: '+',
            e1: MIR_VARIABLE('a', MIR_INT_TYPE),
            e2: MIR_VARIABLE('t', MIR_INT_TYPE),
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_ZERO,
            functionArguments: [VARIABLE_J],
            returnType: MIR_INT_TYPE,
          }),
          MIR_BINARY({
            name: 'tmp_i',
            operator: '+',
            e1: VARIABLE_I,
            e2: MIR_INT(2),
          }),
        ],
      }),
    ],
    MIR_ZERO,
    `let _loop_0: int = (init_i: int) * 3;
let _loop_2: int = (init_i: int) * 3;
let _loop_3: int = (a: int) + (_loop_2: int);
let i: int = (init_i: int);
let j: int = (_loop_3: int);
while (true) {
  let _loop_6: bool = (L: int) <= (i: int);
  if (_loop_6: bool) {
    undefined = 0;
    break;
  }
  0((j: int));
  let _loop_4: int = (i: int) + 2;
  let _loop_5: int = (j: int) + 6;
  i = (_loop_4: int);
  j = (_loop_5: int);
}
return 0;`
  );
});
