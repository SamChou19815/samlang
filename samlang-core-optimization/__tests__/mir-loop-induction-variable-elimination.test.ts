import {
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_INDEX_ACCESS,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import midIRLoopInductionVariableEliminationOptimization from '../mir-loop-induction-variable-elimination';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

describe('mir-loop-induction-variable-elimination', () => {
  it('midIRLoopInductionVariableEliminationOptimization rejects unoptimizable loops', () => {
    const allocator = new OptimizationResourceAllocator();

    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_INT(2),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: '',
              type: MIR_INT_TYPE,
              initialValue: MIR_ZERO,
              loopValue: MIR_VARIABLE('i', MIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [],
          statements: [],
        },
        allocator
      )
    ).toBeNull();

    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_INT(2),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [],
          derivedInductionVariables: [],
          statements: [],
          breakCollector: { name: '', type: MIR_INT_TYPE, value: MIR_VARIABLE('i', MIR_INT_TYPE) },
        },
        allocator
      )
    ).toBeNull();

    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_INT(2),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [],
          derivedInductionVariables: [],
          statements: [
            MIR_INDEX_ACCESS({
              name: '',
              type: MIR_INT_TYPE,
              pointerExpression: MIR_ZERO,
              index: 3,
            }),
            MIR_BINARY({ name: '', operator: '!=', e1: MIR_ZERO, e2: MIR_ZERO }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_ZERO,
              functionArguments: [MIR_ZERO],
              returnType: MIR_INT_TYPE,
            }),
            MIR_IF_ELSE({
              booleanExpression: MIR_ZERO,
              s1: [
                MIR_SINGLE_IF({
                  booleanExpression: MIR_ZERO,
                  invertCondition: false,
                  statements: [MIR_BREAK(MIR_ZERO)],
                }),
              ],
              s2: [MIR_CAST({ name: 'd', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
              finalAssignments: [
                { name: '', type: MIR_INT_TYPE, branch1Value: MIR_ZERO, branch2Value: MIR_ZERO },
              ],
            }),
            MIR_WHILE({
              loopVariables: [
                { name: '', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
              ],
              statements: [
                MIR_STRUCT_INITIALIZATION({
                  structVariableName: '',
                  type: MIR_INT_TYPE,
                  expressionList: [MIR_ZERO],
                }),
              ],
            }),
          ],
        },
        allocator
      )
    ).toBeNull();

    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_VARIABLE('const', MIR_INT_TYPE),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: MIR_INT_TYPE,
              initialValue: MIR_ZERO,
              loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            { name: 'tmp_j', baseName: 'i', multiplier: MIR_INT(3), immediate: MIR_INT(5) },
          ],
          statements: [],
        },
        allocator
      )
    ).toBeNull();

    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_INT(2),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: MIR_INT_TYPE,
              initialValue: MIR_ZERO,
              loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            { name: 'tmp_j', baseName: 'i', multiplier: MIR_INT(3), immediate: MIR_INT(5) },
            { name: 'tmp_k', baseName: 'i', multiplier: MIR_INT(3), immediate: MIR_INT(5) },
          ],
          statements: [],
        },
        allocator
      )
    ).toBeNull();
  });

  it('midIRLoopInductionVariableEliminationOptimization optimizes good loops 1/n', () => {
    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_INT(2),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: MIR_INT_TYPE,
              initialValue: MIR_ZERO,
              loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            { name: 'tmp_j', baseName: 'i', multiplier: MIR_INT(3), immediate: MIR_INT(5) },
          ],
          statements: [],
        },
        new OptimizationResourceAllocator()
      )
    ).toEqual({
      prefixStatements: [
        MIR_BINARY({ name: '_loop_0', operator: '*', e1: MIR_INT(3), e2: MIR_ONE }),
        MIR_BINARY({
          name: '_loop_1',
          operator: '+',
          e1: MIR_VARIABLE('_loop_0', MIR_INT_TYPE),
          e2: MIR_INT(5),
        }),
        MIR_BINARY({ name: '_loop_2', operator: '*', e1: MIR_INT(10), e2: MIR_INT(3) }),
        MIR_BINARY({
          name: '_loop_3',
          operator: '+',
          e1: MIR_VARIABLE('_loop_2', MIR_INT_TYPE),
          e2: MIR_INT(5),
        }),
      ],
      optimizableWhileLoop: {
        basicInductionVariableWithLoopGuard: {
          name: 'tmp_j',
          initialValue: MIR_VARIABLE('_loop_1', MIR_INT_TYPE),
          incrementAmount: MIR_INT(6),
          guardOperator: '<',
          guardExpression: MIR_VARIABLE('_loop_3', MIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          {
            name: 'j',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
          },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
    });
  });

  it('midIRLoopInductionVariableEliminationOptimization optimizes good loops 2/n', () => {
    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_INT(1),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: MIR_INT_TYPE,
              initialValue: MIR_ZERO,
              loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            {
              name: 'tmp_j',
              baseName: 'i',
              multiplier: MIR_VARIABLE('a', MIR_INT_TYPE),
              immediate: MIR_INT(5),
            },
          ],
          statements: [],
        },
        new OptimizationResourceAllocator()
      )
    ).toEqual({
      prefixStatements: [
        MIR_BINARY({
          name: '_loop_0',
          operator: '*',
          e1: MIR_VARIABLE('a', MIR_INT_TYPE),
          e2: MIR_ONE,
        }),
        MIR_BINARY({
          name: '_loop_1',
          operator: '+',
          e1: MIR_VARIABLE('_loop_0', MIR_INT_TYPE),
          e2: MIR_INT(5),
        }),
        MIR_BINARY({
          name: '_loop_2',
          operator: '*',
          e1: MIR_VARIABLE('a', MIR_INT_TYPE),
          e2: MIR_INT(10),
        }),
        MIR_BINARY({
          name: '_loop_3',
          operator: '+',
          e1: MIR_VARIABLE('_loop_2', MIR_INT_TYPE),
          e2: MIR_INT(5),
        }),
      ],
      optimizableWhileLoop: {
        basicInductionVariableWithLoopGuard: {
          name: 'tmp_j',
          initialValue: MIR_VARIABLE('_loop_1', MIR_INT_TYPE),
          incrementAmount: MIR_VARIABLE('a', MIR_INT_TYPE),
          guardOperator: '<',
          guardExpression: MIR_VARIABLE('_loop_3', MIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          {
            name: 'j',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
          },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
    });
  });

  it('midIRLoopInductionVariableEliminationOptimization optimizes good loops 3/n', () => {
    expect(
      midIRLoopInductionVariableEliminationOptimization(
        {
          basicInductionVariableWithLoopGuard: {
            name: 'i',
            initialValue: MIR_ONE,
            incrementAmount: MIR_VARIABLE('a', MIR_INT_TYPE),
            guardOperator: '<',
            guardExpression: MIR_INT(10),
          },
          generalInductionVariables: [],
          loopVariablesThatAreNotBasicInductionVariables: [
            {
              name: 'j',
              type: MIR_INT_TYPE,
              initialValue: MIR_ZERO,
              loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
            },
          ],
          derivedInductionVariables: [
            {
              name: 'tmp_j',
              baseName: 'i',
              multiplier: MIR_ONE,
              immediate: MIR_INT(5),
            },
          ],
          statements: [],
        },
        new OptimizationResourceAllocator()
      )
    ).toEqual({
      prefixStatements: [
        MIR_BINARY({
          name: '_loop_0',
          operator: '*',
          e1: MIR_ONE,
          e2: MIR_ONE,
        }),
        MIR_BINARY({
          name: '_loop_1',
          operator: '+',
          e1: MIR_VARIABLE('_loop_0', MIR_INT_TYPE),
          e2: MIR_INT(5),
        }),
        MIR_BINARY({
          name: '_loop_2',
          operator: '*',
          e1: MIR_INT(10),
          e2: MIR_ONE,
        }),
        MIR_BINARY({
          name: '_loop_3',
          operator: '+',
          e1: MIR_VARIABLE('_loop_2', MIR_INT_TYPE),
          e2: MIR_INT(5),
        }),
      ],
      optimizableWhileLoop: {
        basicInductionVariableWithLoopGuard: {
          name: 'tmp_j',
          initialValue: MIR_VARIABLE('_loop_1', MIR_INT_TYPE),
          incrementAmount: MIR_VARIABLE('a', MIR_INT_TYPE),
          guardOperator: '<',
          guardExpression: MIR_VARIABLE('_loop_3', MIR_INT_TYPE),
        },
        generalInductionVariables: [],
        loopVariablesThatAreNotBasicInductionVariables: [
          {
            name: 'j',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
          },
        ],
        derivedInductionVariables: [],
        statements: [],
      },
    });
  });
});
