import {
  HighIRNameExpression,
  HighIRExpression,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_NAME,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_STRUCT_INITIALIZATION,
} from '../../ast/hir-nodes';
import { zip } from '../../utils';
import extractOptimizableWhileLoop, {
  getGuardOperator_EXPOSED_FOR_TESTING,
  mergeVariableAdditionIntoDerivedInductionVariable_EXPOSED_FOR_TESTING,
  extractLoopGuardStructure_EXPOSED_FOR_TESTING,
  expressionIsLoopInvariant_EXPOSED_FOR_TESTING,
  extractBasicInductionVariables_EXPOSED_FOR_TESTING,
  extractDerivedInductionVariables_EXPOSED_FOR_TESTING,
  removeDeadCodeInsideLoop_EXPOSED_FOR_TESTING,
} from '../hir-loop-induction-analysis';

const VARIABLE_I = HIR_VARIABLE('i', HIR_INT_TYPE);
const VARIABLE_J = HIR_VARIABLE('j', HIR_INT_TYPE);
const VARIABLE_TMP_I = HIR_VARIABLE('tmp_i', HIR_INT_TYPE);
const VARIABLE_TMP_J = HIR_VARIABLE('tmp_j', HIR_INT_TYPE);
const VARIABLE_OUTSIDE = HIR_VARIABLE('outside', HIR_INT_TYPE);

const mockExpressionIsLoopInvariant = (e: HighIRExpression): boolean =>
  e.__type__ === 'HighIRIntLiteralExpression';

const mockExpressionIsLoopInvariantWithOutside = (e: HighIRExpression): boolean =>
  e.__type__ === 'HighIRIntLiteralExpression' ||
  (e.__type__ === 'HighIRVariableExpression' && e.name === VARIABLE_OUTSIDE.name);

describe('hir-loop-induction-analysis', () => {
  it('expressionIsLoopInvariant test', () => {
    expect(
      expressionIsLoopInvariant_EXPOSED_FOR_TESTING(HIR_NAME('ss', HIR_BOOL_TYPE), new Set())
    ).toBe(false);
    expect(expressionIsLoopInvariant_EXPOSED_FOR_TESTING(HIR_ZERO, new Set())).toBe(true);
  });

  it('mergeVariableAdditionIntoDerivedInductionVariable test', () => {
    expect(
      mergeVariableAdditionIntoDerivedInductionVariable_EXPOSED_FOR_TESTING(
        {
          baseName: 'a',
          multiplier: HIR_ONE,
          immediate: HIR_ONE,
        },
        {
          baseName: 'a',
          multiplier: HIR_VARIABLE('vv', HIR_INT_TYPE),
          immediate: HIR_ONE,
        }
      )
    ).toBeNull();
  });

  it('extractLoopGuardStructure can reject not optimizable loops.', () => {
    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({ loopVariables: [], statements: [] }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName: '',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
              expressionList: [],
            }),
            HIR_STRUCT_INITIALIZATION({
              structVariableName: '',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
              expressionList: [],
            }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_BINARY({ name: '', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO }),
            HIR_STRUCT_INITIALIZATION({
              structVariableName: '',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
              expressionList: [],
            }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_STRUCT_INITIALIZATION({
              structVariableName: '',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
              expressionList: [],
            }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_STRUCT_INITIALIZATION({
              structVariableName: '',
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
              expressionList: [],
            }),
            HIR_SINGLE_IF({ booleanExpression: HIR_ZERO, invertCondition: false, statements: [] }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_SINGLE_IF({ booleanExpression: HIR_ZERO, invertCondition: false, statements: [] }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
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
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
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
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
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
              statements: [
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  expressionList: [],
                }),
              ],
            }),
            HIR_IF_ELSE({
              booleanExpression: HIR_ZERO,
              s1: [
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  expressionList: [],
                }),
              ],
              s2: [
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  expressionList: [],
                }),
              ],
              finalAssignments: [],
            }),
            HIR_INDEX_ACCESS({
              name: '',
              type: HIR_INT_TYPE,
              pointerExpression: HIR_ZERO,
              index: 0,
            }),
            HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
            HIR_BREAK(HIR_ZERO),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_SINGLE_IF({
              booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
              invertCondition: false,
              statements: [
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  expressionList: [],
                }),
              ],
            }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();

    expect(
      extractLoopGuardStructure_EXPOSED_FOR_TESTING(
        HIR_WHILE({
          loopVariables: [],
          statements: [
            HIR_BINARY({ name: 'cc', operator: '<', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_SINGLE_IF({
              booleanExpression: HIR_NAME('ss', HIR_BOOL_TYPE),
              invertCondition: false,
              statements: [
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  expressionList: [],
                }),
              ],
            }),
            HIR_BINARY({ name: 'cc', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
          ],
        }),
        mockExpressionIsLoopInvariant
      )
    ).toBeNull();
  });

  it('Unsupported loops are rejected.', () => {
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
        }),
        new Set()
      )
    ).toBeNull();

    expect(
      extractOptimizableWhileLoop(
        HIR_WHILE({
          loopVariables: [
            {
              name: 'i',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: VARIABLE_TMP_I,
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
        }),
        new Set()
      )
    ).toBeNull();

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
        }),
        new Set()
      )
    ).toBeNull();
  });

  it('Good loops are accepted.', () => {
    expect(
      extractOptimizableWhileLoop(
        HIR_WHILE({
          loopVariables: [
            {
              name: 'i',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: VARIABLE_TMP_I,
            },
            {
              name: 'j',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: VARIABLE_TMP_J,
            },
            {
              name: 'x',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            },
          ],
          statements: [
            HIR_BINARY({ name: 'cc', operator: '>=', e1: VARIABLE_I, e2: HIR_ZERO }),
            HIR_SINGLE_IF({
              booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
              invertCondition: false,
              statements: [HIR_BREAK(HIR_ZERO)],
            }),
            HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
            HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(3) }),
            HIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: HIR_INT(5) }),
            HIR_BINARY({
              name: 'tmp_y',
              operator: '+',
              e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
              e2: HIR_INT(6),
            }),
          ],
          breakCollector: { name: 'bc', type: HIR_INT_TYPE },
        }),
        new Set()
      )
    ).toEqual({
      basicInductionVariableWithLoopGuard: {
        name: 'i',
        initialValue: HIR_ZERO,
        incrementAmount: HIR_ONE,
        guardOperator: '<',
        guardExpression: HIR_ZERO,
      },
      generalInductionVariables: [
        { name: 'j', initialValue: HIR_ZERO, incrementAmount: HIR_INT(3) },
      ],
      loopVariablesThatAreNotBasicInductionVariables: [
        {
          name: 'x',
          type: HIR_INT_TYPE,
          initialValue: HIR_ZERO,
          loopValue: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
        },
      ],
      derivedInductionVariables: [
        { name: 'tmp_x', baseName: 'i', multiplier: HIR_INT(5), immediate: HIR_INT(5) },
        { name: 'tmp_y', baseName: 'i', multiplier: HIR_INT(5), immediate: HIR_INT(11) },
      ],
      statements: [],
      breakCollector: { name: 'bc', type: HIR_INT_TYPE, value: HIR_ZERO },
    });
  });

  it('getGuardOperator works', () => {
    const operators = ['<', '<=', '>', '>='] as const;
    const replacementOperators = ['>=', '>', '<=', '<'] as const;
    zip(operators, replacementOperators).forEach(([guardOperator, expectedGuardOperator]) => {
      expect(getGuardOperator_EXPOSED_FOR_TESTING(guardOperator, true)).toBe(guardOperator);
      expect(getGuardOperator_EXPOSED_FOR_TESTING(guardOperator, false)).toBe(
        expectedGuardOperator
      );
    });
  });

  it('extractBasicInductionVariables works.', () => {
    expect(
      extractBasicInductionVariables_EXPOSED_FOR_TESTING(
        'i',
        [
          { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
          { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
        ],
        [],
        () => true
      )
    ).toBeNull();

    expect(
      extractBasicInductionVariables_EXPOSED_FOR_TESTING(
        'i',
        [
          { name: 'i', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_I },
          { name: 'j', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: VARIABLE_TMP_J },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(3) }),
        ],
        (e) => e.__type__ === 'HighIRIntLiteralExpression'
      )
    ).toEqual({
      loopVariablesThatAreNotBasicInductionVariables: [],
      allBasicInductionVariables: [
        {
          name: 'i',
          loopValueCollector: 'tmp_i',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_ONE,
        },
        {
          name: 'j',
          loopValueCollector: 'tmp_j',
          initialValue: HIR_ZERO,
          incrementAmount: HIR_INT(3),
        },
      ],
      basicInductionVariableWithAssociatedLoopGuard: {
        name: 'i',
        loopValueCollector: 'tmp_i',
        initialValue: HIR_ZERO,
        incrementAmount: HIR_ONE,
      },
    });
  });

  it('removeDeadCodeInsideLoop works.', () => {
    expect(
      removeDeadCodeInsideLoop_EXPOSED_FOR_TESTING(
        [
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
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(3) }),
          HIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: HIR_INT(5) }),
          HIR_BINARY({
            name: 'tmp_y',
            operator: '+',
            e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            e2: HIR_INT(6),
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
            functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
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
        ]
      )
    ).toEqual([
      HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
      HIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: HIR_INT(5) }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
        functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
        returnType: HIR_INT_TYPE,
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
        functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
        returnType: HIR_INT_TYPE,
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
            initialValue: HIR_ZERO,
            incrementAmount: HIR_ONE,
          },
          {
            name: 'j',
            loopValueCollector: 'tmp_j',
            initialValue: HIR_ZERO,
            incrementAmount: HIR_INT(3),
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_J, e2: HIR_INT(3) }),
          HIR_BINARY({ name: 'tmp_x', operator: '*', e1: VARIABLE_TMP_I, e2: HIR_INT(5) }),
          HIR_BINARY({
            name: 'tmp_y',
            operator: '+',
            e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
            e2: HIR_INT(6),
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
            functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
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
        mockExpressionIsLoopInvariant
      )
    ).toEqual([
      { name: 'tmp_x', baseName: 'i', multiplier: HIR_INT(5), immediate: HIR_INT(5) },
      { name: 'tmp_y', baseName: 'i', multiplier: HIR_INT(5), immediate: HIR_INT(11) },
      { name: 'tmp_z', baseName: 'i', multiplier: HIR_INT(10), immediate: HIR_INT(16) },
    ]);
  });

  it('extractDerivedInductionVariables works 2/n.', () => {
    expect(
      extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
        [
          {
            name: 'i',
            loopValueCollector: 'tmp_i',
            initialValue: HIR_ZERO,
            incrementAmount: HIR_ONE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_x', operator: '+', e1: VARIABLE_TMP_I, e2: VARIABLE_OUTSIDE }),
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
            initialValue: HIR_ZERO,
            incrementAmount: HIR_ONE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({
            name: 'tmp_j',
            operator: '+',
            e1: VARIABLE_I,
            e2: HIR_NAME('outside', HIR_INT_TYPE),
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
            initialValue: HIR_ZERO,
            incrementAmount: VARIABLE_OUTSIDE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_TMP_I, e2: HIR_ZERO }),
        ],
        mockExpressionIsLoopInvariantWithOutside
      )
    ).toEqual([{ name: 'tmp_j', baseName: 'i', multiplier: HIR_ONE, immediate: VARIABLE_OUTSIDE }]);
  });

  it('extractDerivedInductionVariables works 5/n.', () => {
    expect(
      extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
        [
          {
            name: 'i',
            loopValueCollector: 'tmp_i',
            initialValue: HIR_ZERO,
            incrementAmount: HIR_ZERO,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ZERO }),
          HIR_BINARY({ name: 'tmp_j', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
        ],
        mockExpressionIsLoopInvariantWithOutside
      )
    ).toEqual([{ name: 'tmp_j', baseName: 'i', multiplier: HIR_ONE, immediate: VARIABLE_OUTSIDE }]);
  });

  it('extractDerivedInductionVariables works 6/n.', () => {
    expect(
      extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
        [
          {
            name: 'i',
            loopValueCollector: 'tmp_i',
            initialValue: HIR_ZERO,
            incrementAmount: VARIABLE_OUTSIDE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
          HIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_TMP_I, e2: HIR_ONE }),
        ],
        mockExpressionIsLoopInvariantWithOutside
      )
    ).toEqual([{ name: 'tmp_j', baseName: 'i', multiplier: HIR_ONE, immediate: VARIABLE_OUTSIDE }]);
  });

  it('extractDerivedInductionVariables works 7/n.', () => {
    expect(
      extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
        [
          {
            name: 'i',
            loopValueCollector: 'tmp_i',
            initialValue: HIR_ZERO,
            incrementAmount: VARIABLE_OUTSIDE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
          HIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_TMP_I, e2: HIR_INT(2) }),
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
            initialValue: HIR_ZERO,
            incrementAmount: HIR_ONE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_TMP_I, e2: VARIABLE_OUTSIDE }),
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
            initialValue: HIR_ZERO,
            incrementAmount: HIR_INT(2),
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_INT(2) }),
          HIR_BINARY({ name: 'tmp_j', operator: '*', e1: VARIABLE_I, e2: VARIABLE_OUTSIDE }),
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
            initialValue: HIR_ZERO,
            incrementAmount: HIR_ONE,
          },
        ],
        [
          HIR_BINARY({ name: 'tmp_i', operator: '+', e1: VARIABLE_I, e2: HIR_ONE }),
          HIR_BINARY({ name: 't1', operator: '+', e1: VARIABLE_TMP_I, e2: HIR_ONE }),
        ],
        mockExpressionIsLoopInvariantWithOutside
      )
    ).toEqual([{ name: 't1', baseName: 'i', multiplier: HIR_ONE, immediate: HIR_INT(2) }]);
  });
});
