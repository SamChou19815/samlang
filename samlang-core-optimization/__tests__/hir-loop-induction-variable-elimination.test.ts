import {
  HighIRNameExpression,
  HIR_INT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
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
  HIR_STRUCT_INITIALIZATION,
  HIR_CLOSURE_INITIALIZATION,
} from 'samlang-core-ast/hir-nodes';

import highIRLoopInductionVariableEliminationOptimization from '../hir-loop-induction-variable-elimination';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

describe('hir-loop-induction-variable-elimination', () => {
  it('highIRLoopInductionVariableEliminationOptimization rejects unoptimizable loops', () => {
    const allocator = new OptimizationResourceAllocator();

    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_INT(2),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: '',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('i', HIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [],
          statements: [],
        },
        allocator
      )
    ).toBeNull();

    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_INT(2),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [],
          derivedInductionVariables: [],
          statements: [],
          breakCollector: { name: '', type: HIR_INT_TYPE, value: HIR_VARIABLE('i', HIR_INT_TYPE) },
        },
        allocator
      )
    ).toBeNull();

    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_INT(2),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [],
          derivedInductionVariables: [],
          statements: [
            HIR_INDEX_ACCESS({
              name: '',
              type: HIR_INT_TYPE,
              pointerExpression: HIR_ZERO,
              index: 3,
            }),
            HIR_BINARY({ name: '', operator: '!=', e1: HIR_ZERO, e2: HIR_ZERO }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_ZERO as unknown as HighIRNameExpression,
              functionArguments: [HIR_ZERO],
              returnType: HIR_INT_TYPE,
            }),
            HIR_IF_ELSE({
              booleanExpression: HIR_ZERO,
              s1: [
                HIR_SINGLE_IF({
                  booleanExpression: HIR_ZERO,
                  invertCondition: false,
                  statements: [HIR_BREAK(HIR_ZERO)],
                }),
              ],
              s2: [
                HIR_CLOSURE_INITIALIZATION({
                  closureVariableName: '_',
                  closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  functionName: '1',
                  functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
                  context: HIR_ZERO,
                }),
              ],
              finalAssignments: [
                { name: '', type: HIR_INT_TYPE, branch1Value: HIR_ZERO, branch2Value: HIR_ZERO },
              ],
            }),
            HIR_WHILE({
              loopVariables: [
                { name: '', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
              ],
              statements: [
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('I'),
                  expressionList: [HIR_ZERO],
                }),
              ],
            }),
          ],
        },
        allocator
      )
    ).toBeNull();

    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_VARIABLE('const', HIR_INT_TYPE),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            { name: 'tmp_j', baseName: 'i', multiplier: HIR_INT(3), immediate: HIR_INT(5) },
          ],
          statements: [],
        },
        allocator
      )
    ).toBeNull();

    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_INT(2),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            { name: 'tmp_j', baseName: 'i', multiplier: HIR_INT(3), immediate: HIR_INT(5) },
            { name: 'tmp_k', baseName: 'i', multiplier: HIR_INT(3), immediate: HIR_INT(5) },
          ],
          statements: [],
        },
        allocator
      )
    ).toBeNull();
  });

  it('highIRLoopInductionVariableEliminationOptimization optimizes good loops 1/n', () => {
    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_INT(2),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            { name: 'tmp_j', baseName: 'i', multiplier: HIR_INT(3), immediate: HIR_INT(5) },
          ],
          statements: [],
        },
        new OptimizationResourceAllocator()
      )
    ).toEqual({
      prefixStatements: [
        HIR_BINARY({ name: '_loop_0', operator: '*', e1: HIR_INT(3), e2: HIR_ONE }),
        HIR_BINARY({
          name: '_loop_1',
          operator: '+',
          e1: HIR_VARIABLE('_loop_0', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
        HIR_BINARY({ name: '_loop_2', operator: '*', e1: HIR_INT(10), e2: HIR_INT(3) }),
        HIR_BINARY({
          name: '_loop_3',
          operator: '+',
          e1: HIR_VARIABLE('_loop_2', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
      ],
      optimizableWhileLoop: {
        basicInductionVariableWithLoopGuard: {
          name: 'tmp_j',
          initialValue: HIR_VARIABLE('_loop_1', HIR_INT_TYPE),
          incrementAmount: HIR_INT(6),
          guardOperator: '<',
          guardExpression: HIR_VARIABLE('_loop_3', HIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          {
            name: 'j',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
          },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
    });
  });

  it('highIRLoopInductionVariableEliminationOptimization optimizes good loops 2/n', () => {
    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_INT(1),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            {
              name: 'tmp_j',
              baseName: 'i',
              multiplier: HIR_VARIABLE('a', HIR_INT_TYPE),
              immediate: HIR_INT(5),
            },
          ],
          statements: [],
        },
        new OptimizationResourceAllocator()
      )
    ).toEqual({
      prefixStatements: [
        HIR_BINARY({
          name: '_loop_0',
          operator: '*',
          e1: HIR_VARIABLE('a', HIR_INT_TYPE),
          e2: HIR_ONE,
        }),
        HIR_BINARY({
          name: '_loop_1',
          operator: '+',
          e1: HIR_VARIABLE('_loop_0', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
        HIR_BINARY({
          name: '_loop_2',
          operator: '*',
          e1: HIR_VARIABLE('a', HIR_INT_TYPE),
          e2: HIR_INT(10),
        }),
        HIR_BINARY({
          name: '_loop_3',
          operator: '+',
          e1: HIR_VARIABLE('_loop_2', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
      ],
      optimizableWhileLoop: {
        basicInductionVariableWithLoopGuard: {
          name: 'tmp_j',
          initialValue: HIR_VARIABLE('_loop_1', HIR_INT_TYPE),
          incrementAmount: HIR_VARIABLE('a', HIR_INT_TYPE),
          guardOperator: '<',
          guardExpression: HIR_VARIABLE('_loop_3', HIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          {
            name: 'j',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
          },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
    });
  });

  it('highIRLoopInductionVariableEliminationOptimization optimizes good loops 3/n', () => {
    expect(
      highIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: HIR_ONE,
            incrementAmount: HIR_VARIABLE('a', HIR_INT_TYPE),
            guardOperator: '<',
            guardExpression: HIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: HIR_INT_TYPE,
              initialValue: HIR_ZERO,
              loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            {
              name: 'tmp_j',
              baseName: 'i',
              multiplier: HIR_ONE,
              immediate: HIR_INT(5),
            },
          ],
          statements: [],
        },
        new OptimizationResourceAllocator()
      )
    ).toEqual({
      prefixStatements: [
        HIR_BINARY({
          name: '_loop_0',
          operator: '*',
          e1: HIR_ONE,
          e2: HIR_ONE,
        }),
        HIR_BINARY({
          name: '_loop_1',
          operator: '+',
          e1: HIR_VARIABLE('_loop_0', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
        HIR_BINARY({
          name: '_loop_2',
          operator: '*',
          e1: HIR_INT(10),
          e2: HIR_ONE,
        }),
        HIR_BINARY({
          name: '_loop_3',
          operator: '+',
          e1: HIR_VARIABLE('_loop_2', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
      ],
      optimizableWhileLoop: {
        basicInductionVariableWithLoopGuard: {
          name: 'tmp_j',
          initialValue: HIR_VARIABLE('_loop_1', HIR_INT_TYPE),
          incrementAmount: HIR_VARIABLE('a', HIR_INT_TYPE),
          guardOperator: '<',
          guardExpression: HIR_VARIABLE('_loop_3', HIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          {
            name: 'j',
            type: HIR_INT_TYPE,
            initialValue: HIR_ZERO,
            loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
          },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
    });
  });
});
