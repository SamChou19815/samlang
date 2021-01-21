import extractOptimizableWhileLoop from '../hir-loop-analysis';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
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
import { Long, zip } from 'samlang-core-utils';

const VARIABLE_I = HIR_VARIABLE('i', HIR_INT_TYPE);
const VARIABLE_J = HIR_VARIABLE('j', HIR_INT_TYPE);

it('Unsupported loops are rejected 1/n', () => {
  expect(extractOptimizableWhileLoop(HIR_WHILE({ loopVariables: [], statements: [] }))).toBeNull();
});

it('Unsupported loops are rejected 2/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
          HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 3/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: '', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO }),
          HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 4/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 5/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
          HIR_SINGLE_IF({ booleanExpression: HIR_ZERO, invertCondition: false, statements: [] }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 6/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({ booleanExpression: HIR_ZERO, invertCondition: false, statements: [] }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 7/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 8/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 9/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 10/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
          HIR_WHILE({ loopVariables: [], statements: [] }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: false,
            statements: [HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
            s2: [HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
            finalAssignments: [],
          }),
          HIR_INDEX_ACCESS({ name: '', type: HIR_INT_TYPE, pointerExpression: HIR_ZERO, index: 0 }),
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO,
            functionArguments: [],
            returnType: HIR_INT_TYPE,
          }),
          HIR_RETURN(HIR_ZERO),
          HIR_BREAK(HIR_ZERO),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 11/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
          }),
        ],
      })
    )
  ).toBeNull();
});

it('Unsupported loops are rejected 12/n', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_i', HIR_INT_TYPE),
          },
        ],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '==', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
        ],
      })
    )
  ).toBeNull();
});

it('very basic loops are recognized 1/n', () => {
  const operators = ['<', '<=', '>', '>='] as const;
  operators.forEach((guardOperator) =>
    expect(
      extractOptimizableWhileLoop(
        HIR_WHILE({
          loopVariables: [
            {
              name: 'i',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_i', HIR_INT_TYPE),
            },
          ],
          statements: [
            HIR_BINARY({ name: 'cc', operator: guardOperator, e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_SINGLE_IF({
              booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
              invertCondition: false,
              statements: [HIR_BREAK(HIR_ZERO)],
            }),
            HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          ],
        })
      )
    ).toEqual({
      basicInductionVariableWithLoopGuard: {
        name: 'i',
        initialValue: HIR_ZERO,
        incrementAmount: Long.ONE,
        guardOperator,
        guardExpresssion: HIR_ZERO,
      },
      generalInductionVariables: [],
      derivedInductionVariables: [],
      otherLoopVariables: [],
      statements: [],
    })
  );
});

it('very basic loops are recognized 2/n', () => {
  const operators = ['<', '<=', '>', '>='] as const;
  const replacementOperators = ['>=', '>', '<=', '<'] as const;
  zip(operators, replacementOperators).forEach(([guardOperator, expectedGuardOperator]) =>
    expect(
      extractOptimizableWhileLoop(
        HIR_WHILE({
          loopVariables: [
            {
              name: 'i',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_i', HIR_INT_TYPE),
            },
          ],
          statements: [
            HIR_BINARY({ name: 'cc', operator: guardOperator, e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_SINGLE_IF({
              booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
              invertCondition: true,
              statements: [HIR_BREAK(HIR_ZERO)],
            }),
            HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          ],
        })
      )
    ).toEqual({
      basicInductionVariableWithLoopGuard: {
        name: 'i',
        initialValue: HIR_ZERO,
        incrementAmount: Long.ONE,
        guardOperator: expectedGuardOperator,
        guardExpresssion: HIR_ZERO,
      },
      generalInductionVariables: [],
      derivedInductionVariables: [],
      otherLoopVariables: [],
      statements: [],
    })
  );
});

it('loops with multiple basic induction variables are recognized.', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_i', HIR_INT_TYPE),
          },
          {
            name: 'j',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
          },
        ],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(3) }),
        ],
      })
    )
  ).toEqual({
    basicInductionVariableWithLoopGuard: {
      name: 'i',
      initialValue: HIR_ZERO,
      incrementAmount: Long.ONE,
      guardOperator: '<',
      guardExpresssion: HIR_ZERO,
    },
    generalInductionVariables: [
      {
        name: 'j',
        initialValue: HIR_ZERO,
        incrementAmount: Long.fromInt(3),
      },
    ],
    derivedInductionVariables: [],
    otherLoopVariables: [],
    statements: [],
  });
});

it('loops with derived induction variables and other statements are recognized.', () => {
  expect(
    extractOptimizableWhileLoop(
      HIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_i', HIR_INT_TYPE),
          },
          {
            name: 'j',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
          },
          {
            name: 'x',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
          },
          {
            name: 'y',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_y', HIR_INT_TYPE),
          },
          {
            name: 'z',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_z', HIR_INT_TYPE),
          },
          {
            name: 'not_inductive_1',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_ZERO,
          },
          {
            name: 'not_inductive_2',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('fc', HIR_INT_TYPE),
          },
        ],
        statements: [
          HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_SINGLE_IF({
            booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(3) }),
          HIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_I, e2: HIR_INT(5) }),
          HIR_BINARY({
            name: 'tmp_y',
            operator: '+',
            e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            e2: HIR_INT(6),
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO,
            functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO,
            functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
            returnCollector: 'fc',
          }),
          HIR_BINARY({
            name: 'tmp_z',
            operator: '+',
            e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            e2: HIR_VARIABLE('tmp_y', HIR_INT_TYPE),
          }),
          HIR_BINARY({
            name: 'tmp_useless_1',
            operator: '-',
            e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            e2: HIR_VARIABLE('tmp_y', HIR_INT_TYPE),
          }),
          HIR_BINARY({
            name: 'tmp_useless_2',
            operator: '+',
            e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            e2: HIR_VARIABLE('tmp_useless_1', HIR_INT_TYPE),
          }),
          HIR_BINARY({
            name: 'tmp_useless_3',
            operator: '+',
            e1: HIR_ZERO,
            e2: HIR_VARIABLE('tmp_useless_1', HIR_INT_TYPE),
          }),
          HIR_BINARY({
            name: 'tmp_useless_4',
            operator: '+',
            e1: HIR_VARIABLE('tmp_useless_1', HIR_INT_TYPE),
            e2: HIR_VARIABLE('tmp_useless_1', HIR_INT_TYPE),
          }),
          HIR_BINARY({ name: 'tmp_useless_6', operator: '+', e1: VARIABLE_I, e2: VARIABLE_J }),
        ],
        breakCollector: { name: 'bc', type: HIR_INT_TYPE },
      })
    )
  ).toEqual({
    basicInductionVariableWithLoopGuard: {
      name: 'i',
      initialValue: HIR_ZERO,
      incrementAmount: Long.ONE,
      guardOperator: '<',
      guardExpresssion: HIR_ZERO,
    },
    generalInductionVariables: [
      {
        name: 'j',
        initialValue: HIR_ZERO,
        incrementAmount: Long.fromInt(3),
      },
    ],
    derivedInductionVariables: [
      {
        name: 'x',
        initialValue: HIR_ZERO,
        baseName: 'i',
        multiplier: Long.fromInt(5),
        immediate: Long.fromInt(5),
      },
      {
        name: 'y',
        initialValue: HIR_ZERO,
        baseName: 'i',
        multiplier: Long.fromInt(5),
        immediate: Long.fromInt(11),
      },
      {
        name: 'z',
        initialValue: HIR_ZERO,
        baseName: 'i',
        multiplier: Long.fromInt(10),
        immediate: Long.fromInt(16),
      },
    ],
    otherLoopVariables: [
      {
        name: 'not_inductive_1',
        type: HIR_INT_TYPE,
        initialValue: HIR_ZERO,
        loopValue: HIR_ZERO,
      },
      {
        name: 'not_inductive_2',
        type: HIR_INT_TYPE,
        initialValue: HIR_ZERO,
        loopValue: HIR_VARIABLE('fc', HIR_INT_TYPE),
      },
    ],
    statements: [
      HIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_I, e2: HIR_INT(5) }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_ZERO,
        functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
        returnType: HIR_INT_TYPE,
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_ZERO,
        functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
        returnType: HIR_INT_TYPE,
        returnCollector: 'fc',
      }),
    ],
    breakCollector: { name: 'bc', type: HIR_INT_TYPE, value: HIR_ZERO },
  });
});
