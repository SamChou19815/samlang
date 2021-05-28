import extractOptimizableWhileLoop, {
  getGuardOperator_EXPOSED_FOR_TESTING,
  mergeVariableAdditionIntoDerivedInductionVariable_EXPOSED_FOR_TESTING,
  extractLoopGuardStructure_EXPOSED_FOR_TESTING,
  expressionIsLoopInvariant_EXPOSED_FOR_TESTING,
  extractBasicInductionVariables_EXPOSED_FOR_TESTING,
  extractDerivedInductionVariables_EXPOSED_FOR_TESTING,
  removeDeadCodeInsideLoop_EXPOSED_FOR_TESTING,
} from '../mir-loop-induction-analysis';

import {
  MidIRExpression,
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_NAME,
  MIR_INDEX_ACCESS,
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
import { zip } from 'samlang-core-utils';

const VARIABLE_I = MIR_VARIABLE('i', MIR_INT_TYPE);
const VARIABLE_J = MIR_VARIABLE('j', MIR_INT_TYPE);
const VARIABLE_TMP_I = MIR_VARIABLE('tmp_i', MIR_INT_TYPE);
const VARIABLE_TMP_J = MIR_VARIABLE('tmp_j', MIR_INT_TYPE);
const VARIABLE_OUTSIDE = MIR_VARIABLE('outside', MIR_INT_TYPE);

const mockExpressionIsLoopInvariant = (e: MidIRExpression): boolean =>
  e.__type__ === 'MidIRIntLiteralExpression';

const mockExpressionIsLoopInvariantWithOutside = (e: MidIRExpression): boolean =>
  e.__type__ === 'MidIRIntLiteralExpression' ||
  (e.__type__ === 'MidIRVariableExpression' && e.name === VARIABLE_OUTSIDE.name);

it('expressionIsLoopInvariant test', () => {
  expect(
    expressionIsLoopInvariant_EXPOSED_FOR_TESTING(MIR_NAME('ss', MIR_BOOL_TYPE), new Set())
  ).toBe(false);
  expect(expressionIsLoopInvariant_EXPOSED_FOR_TESTING(MIR_ZERO, new Set())).toBe(true);
});

it('mergeVariableAdditionIntoDerivedInductionVariable test', () => {
  expect(
    mergeVariableAdditionIntoDerivedInductionVariable_EXPOSED_FOR_TESTING(
      {
        baseName: 'a',
        multiplier: MIR_ONE,
        immediate: MIR_ONE,
      },
      {
        baseName: 'a',
        multiplier: MIR_VARIABLE('vv', MIR_INT_TYPE),
        immediate: MIR_ONE,
      }
    )
  ).toBeNull();
});

it('extractLoopGuardStructure can reject not optimizable loops.', () => {
  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({ loopVariables: [], statements: [] }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
          MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: '', operator: '+', e1: MIR_ZERO, e2: MIR_ZERO }),
          MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
          MIR_SINGLE_IF({ booleanExpression: MIR_ZERO, invertCondition: false, statements: [] }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({ booleanExpression: MIR_ZERO, invertCondition: false, statements: [] }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_ZERO,
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_ZERO,
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
          MIR_WHILE({ loopVariables: [], statements: [] }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_ZERO,
            invertCondition: false,
            statements: [MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
          }),
          MIR_IF_ELSE({
            booleanExpression: MIR_ZERO,
            s1: [MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            s2: [MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            finalAssignments: [],
          }),
          MIR_INDEX_ACCESS({ name: '', type: MIR_INT_TYPE, pointerExpression: MIR_ZERO, index: 0 }),
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_ZERO,
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
          MIR_BREAK(MIR_ZERO),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
          }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();

  expect(
    extractLoopGuardStructure_EXPOSED_FOR_TESTING(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_NAME('ss', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
          }),
          MIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: MIR_ZERO }),
        ],
      }),
      mockExpressionIsLoopInvariant
    )
  ).toBeNull();
});

it('Unsupported loops are rejected.', () => {
  expect(
    extractOptimizableWhileLoop(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
        ],
      }),
      new Set()
    )
  ).toBeNull();

  expect(
    extractOptimizableWhileLoop(
      MIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: VARIABLE_TMP_I,
          },
        ],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '==', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
          MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        ],
      }),
      new Set()
    )
  ).toBeNull();

  expect(
    extractOptimizableWhileLoop(
      MIR_WHILE({
        loopVariables: [],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
        ],
      }),
      new Set()
    )
  ).toBeNull();
});

it('Good loops are accepted.', () => {
  expect(
    extractOptimizableWhileLoop(
      MIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: VARIABLE_TMP_I,
          },
          {
            name: 'j',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: VARIABLE_TMP_J,
          },
          {
            name: 'x',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          },
        ],
        statements: [
          MIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: MIR_ZERO }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
          MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
          MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: MIR_INT(3) }),
          MIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: MIR_INT(5) }),
          MIR_BINARY({
            name: 'tmp_y',
            operator: '+',
            e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
            e2: MIR_INT(6),
          }),
        ],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE },
      }),
      new Set()
    )
  ).toEqual({
    basicInductionVariableWithLoopGuard: {
      name: 'i',
      initialValue: MIR_ZERO,
      incrementAmount: MIR_ONE,
      guardOperator: '<',
      guardExpression: MIR_ZERO,
    },
    generalInductionVariables: [{ name: 'j', initialValue: MIR_ZERO, incrementAmount: MIR_INT(3) }],
    loopVariablesThatAreNotBasicInductionVariables: [
      {
        name: 'x',
        type: MIR_INT_TYPE,
        initialValue: MIR_ZERO,
        loopValue: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
      },
    ],
    derivedInductionVariables: [
      { name: 'tmp_x', baseName: 'i', multiplier: MIR_INT(5), immediate: MIR_INT(5) },
      { name: 'tmp_y', baseName: 'i', multiplier: MIR_INT(5), immediate: MIR_INT(11) },
    ],
    statements: [],
    breakCollector: { name: 'bc', type: MIR_INT_TYPE, value: MIR_ZERO },
  });
});

it('getGuardOperator works', () => {
  const operators = ['<', '<=', '>', '>='] as const;
  const replacementOperators = ['>=', '>', '<=', '<'] as const;
  zip(operators, replacementOperators).forEach(([guardOperator, expectedGuardOperator]) => {
    expect(getGuardOperator_EXPOSED_FOR_TESTING(guardOperator, true)).toBe(guardOperator);
    expect(getGuardOperator_EXPOSED_FOR_TESTING(guardOperator, false)).toBe(expectedGuardOperator);
  });
});

it('extractBasicInductionVariables works.', () => {
  expect(
    extractBasicInductionVariables_EXPOSED_FOR_TESTING(
      'i',
      [
        { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
        { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
      ],
      [],
      () => true
    )
  ).toBeNull();

  expect(
    extractBasicInductionVariables_EXPOSED_FOR_TESTING(
      'i',
      [
        { name: 'i', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_I },
        { name: 'j', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: VARIABLE_TMP_J },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: MIR_INT(3) }),
      ],
      (e) => e.__type__ === 'MidIRIntLiteralExpression'
    )
  ).toEqual({
    loopVariablesThatAreNotBasicInductionVariables: [],
    allBasicInductionVariables: [
      { name: 'i', loopValueCollector: 'tmp_i', initialValue: MIR_ZERO, incrementAmount: MIR_ONE },
      {
        name: 'j',
        loopValueCollector: 'tmp_j',
        initialValue: MIR_ZERO,
        incrementAmount: MIR_INT(3),
      },
    ],
    basicInductionVariableWithAssociatedLoopGuard: {
      name: 'i',
      loopValueCollector: 'tmp_i',
      initialValue: MIR_ZERO,
      incrementAmount: MIR_ONE,
    },
  });
});

it('removeDeadCodeInsideLoop works.', () => {
  expect(
    removeDeadCodeInsideLoop_EXPOSED_FOR_TESTING(
      [
        {
          name: 'not_inductive_1',
          type: MIR_INT_TYPE,
          initialValue: MIR_ZERO,
          loopValue: MIR_ZERO,
        },
        {
          name: 'not_inductive_2',
          type: MIR_INT_TYPE,
          initialValue: MIR_ZERO,
          loopValue: MIR_VARIABLE('fc', MIR_INT_TYPE),
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: MIR_INT(3) }),
        MIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: MIR_INT(5) }),
        MIR_BINARY({
          name: 'tmp_y',
          operator: '+',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_INT(6),
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_ZERO,
          functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
          returnType: MIR_INT_TYPE,
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_ZERO,
          functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
          returnType: MIR_INT_TYPE,
          returnCollector: 'fc',
        }),
        MIR_BINARY({
          name: 'tmp_z',
          operator: '+',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_y', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_1',
          operator: '-',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_y', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_2',
          operator: '+',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_3',
          operator: '+',
          e1: MIR_ZERO,
          e2: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_4',
          operator: '+',
          e1: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
        }),
        MIR_BINARY({ name: 'tmp_useless_6', operator: '+', e1: VARIABLE_I, e2: VARIABLE_J }),
      ]
    )
  ).toEqual([
    MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
    MIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: MIR_INT(5) }),
    MIR_FUNCTION_CALL({
      functionExpression: MIR_ZERO,
      functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
      returnType: MIR_INT_TYPE,
    }),
    MIR_FUNCTION_CALL({
      functionExpression: MIR_ZERO,
      functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
      returnType: MIR_INT_TYPE,
      returnCollector: 'fc',
    }),
  ]);
});

it('extractDerivedInductionVariables works 1/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ONE,
        },
        {
          name: 'j',
          loopValueCollector: 'tmp_j',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_INT(3),
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: MIR_INT(3) }),
        MIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: MIR_INT(5) }),
        MIR_BINARY({
          name: 'tmp_y',
          operator: '+',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_INT(6),
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_ZERO,
          functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
          returnType: MIR_INT_TYPE,
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_ZERO,
          functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
          returnType: MIR_INT_TYPE,
          returnCollector: 'fc',
        }),
        MIR_BINARY({
          name: 'tmp_z',
          operator: '+',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_y', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_1',
          operator: '-',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_y', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_2',
          operator: '+',
          e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_3',
          operator: '+',
          e1: MIR_ZERO,
          e2: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
        }),
        MIR_BINARY({
          name: 'tmp_useless_4',
          operator: '+',
          e1: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
          e2: MIR_VARIABLE('tmp_useless_1', MIR_INT_TYPE),
        }),
        MIR_BINARY({ name: 'tmp_useless_6', operator: '+', e1: VARIABLE_I, e2: VARIABLE_J }),
      ],
      mockExpressionIsLoopInvariant
    )
  ).toEqual([
    { name: 'tmp_x', baseName: 'i', multiplier: MIR_INT(5), immediate: MIR_INT(5) },
    { name: 'tmp_y', baseName: 'i', multiplier: MIR_INT(5), immediate: MIR_INT(11) },
    { name: 'tmp_z', baseName: 'i', multiplier: MIR_INT(10), immediate: MIR_INT(16) },
  ]);
});

it('extractDerivedInductionVariables works 2/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ONE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 'tmp_x', operator: '+', e1: VARIABLE_TMP_I, e2: VARIABLE_OUTSIDE }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([]);
});

it('extractDerivedInductionVariables works 3/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ONE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({
          name: 'tmp_j',
          operator: '+',
          e1: VARIABLE_I,
          e2: MIR_NAME('outside', MIR_INT_TYPE),
        }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([]);
});

it('extractDerivedInductionVariables works 4/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: VARIABLE_OUTSIDE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
        MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: MIR_ZERO }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([{ name: 'tmp_j', baseName: 'i', multiplier: MIR_ONE, immediate: VARIABLE_OUTSIDE }]);
});

it('extractDerivedInductionVariables works 5/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ZERO,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ZERO }),
        MIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([{ name: 'tmp_j', baseName: 'i', multiplier: MIR_ONE, immediate: VARIABLE_OUTSIDE }]);
});

it('extractDerivedInductionVariables works 6/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: VARIABLE_OUTSIDE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
        MIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_TMP_I, e2: MIR_ONE }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([{ name: 'tmp_j', baseName: 'i', multiplier: MIR_ONE, immediate: VARIABLE_OUTSIDE }]);
});

it('extractDerivedInductionVariables works 7/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: VARIABLE_OUTSIDE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
        MIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_TMP_I, e2: MIR_INT(2) }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([]);
});

it('extractDerivedInductionVariables works 8/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ONE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_TMP_I, e2: VARIABLE_OUTSIDE }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([
    { name: 'tmp_j', baseName: 'i', multiplier: VARIABLE_OUTSIDE, immediate: VARIABLE_OUTSIDE },
  ]);
});

it('extractDerivedInductionVariables works 9/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_INT(2),
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_INT(2) }),
        MIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([]);
});

it('extractDerivedInductionVariables works 10/n.', () => {
  expect(
    extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
      [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: MIR_ZERO,
          incrementAmount: MIR_ONE,
        },
      ],
      [
        MIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: MIR_ONE }),
        MIR_BINARY({ name: 't1', operator: '+', e1: VARIABLE_TMP_I, e2: MIR_ONE }),
      ],
      mockExpressionIsLoopInvariantWithOutside
    )
  ).toEqual([{ name: 't1', baseName: 'i', multiplier: MIR_ONE, immediate: MIR_INT(2) }]);
});
