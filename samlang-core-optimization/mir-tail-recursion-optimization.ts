import {
  MidIRExpression,
  MidIRStatement,
  MIR_ZERO,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRFunction, MidIRType } from 'samlang-core-ast/mir-nodes';
import { assert, zip3 } from 'samlang-core-utils';

import OptimizationResourceAllocator from './optimization-resource-allocator';

type RewriteResult = {
  readonly statements: readonly MidIRStatement[];
  readonly functionArguments: readonly MidIRExpression[];
};

const tryRewriteStatementsForTailRecursionWithoutUsingReturnValue = (
  statements: readonly MidIRStatement[],
  functionName: string,
  functionParameterTypes: readonly MidIRType[],
  expectedReturnCollector: string | null,
  allocator: OptimizationResourceAllocator
): RewriteResult | null => {
  const lastStatement = statements[statements.length - 1];
  if (lastStatement == null) return null;

  const getBreakValueFromBranchValue = (
    branchValue: MidIRExpression | undefined
  ): MidIRExpression => branchValue ?? MIR_ZERO;

  switch (lastStatement.__type__) {
    case 'MidIRFunctionCallStatement':
      if (
        lastStatement.functionExpression.__type__ !== 'MidIRNameExpression' ||
        lastStatement.functionExpression.name !== functionName
      ) {
        return null;
      }
      if (
        expectedReturnCollector != null &&
        lastStatement.returnCollector !== expectedReturnCollector
      ) {
        return null;
      }
      return {
        statements:
          expectedReturnCollector == null
            ? statements.slice(0, statements.length - 1)
            : [
                ...statements.slice(0, statements.length - 1),
                // Stick in some dummy value. It will later be optimized away by constant propagation.
                MIR_BINARY({
                  name: expectedReturnCollector,
                  operator: '+',
                  e1: MIR_ZERO,
                  e2: MIR_ZERO,
                }),
              ],
        functionArguments: lastStatement.functionArguments,
      };

    case 'MidIRIfElseStatement': {
      const relaventFinalAssignment = lastStatement.finalAssignments.find(
        (it) => it.name === expectedReturnCollector
      );
      let newExpectedReturnCollector: readonly [string | null, string | null] = [null, null];
      if (expectedReturnCollector != null) {
        if (relaventFinalAssignment == null) return null;
        const { branch1Value, branch2Value } = relaventFinalAssignment;
        newExpectedReturnCollector = [
          branch1Value.__type__ === 'MidIRVariableExpression' ? branch1Value.name : null,
          branch2Value.__type__ === 'MidIRVariableExpression' ? branch2Value.name : null,
        ];
      }
      const s1Result = tryRewriteStatementsForTailRecursionWithoutUsingReturnValue(
        lastStatement.s1,
        functionName,
        functionParameterTypes,
        newExpectedReturnCollector[0],
        allocator
      );
      const s2Result = tryRewriteStatementsForTailRecursionWithoutUsingReturnValue(
        lastStatement.s2,
        functionName,
        functionParameterTypes,
        newExpectedReturnCollector[1],
        allocator
      );
      if (s1Result == null && s2Result == null) return null;
      if (s1Result == null) {
        assert(s2Result != null, 'If you see this, then boolean algebra must be broken.');
        return {
          statements: [
            ...statements.slice(0, statements.length - 1),
            MIR_SINGLE_IF({
              booleanExpression: lastStatement.booleanExpression,
              invertCondition: false,
              statements: [
                ...lastStatement.s1,
                MIR_BREAK(getBreakValueFromBranchValue(relaventFinalAssignment?.branch1Value)),
              ],
            }),
            ...s2Result.statements,
          ],
          functionArguments: s2Result.functionArguments,
        };
      }
      if (s2Result == null) {
        assert(s1Result != null, 'If you see this, then boolean algebra must be broken.');
        return {
          statements: [
            ...statements.slice(0, statements.length - 1),
            MIR_SINGLE_IF({
              booleanExpression: lastStatement.booleanExpression,
              invertCondition: true,
              statements: [
                ...lastStatement.s2,
                MIR_BREAK(getBreakValueFromBranchValue(relaventFinalAssignment?.branch2Value)),
              ],
            }),
            ...s1Result.statements,
          ],
          functionArguments: s1Result.functionArguments,
        };
      }
      const newFinalAssignments = zip3(
        s1Result.functionArguments,
        s2Result.functionArguments,
        functionParameterTypes
      ).map(([branch1Value, branch2Value, type]) => ({
        name: allocator.allocateTailRecTemporary(),
        type,
        branch1Value,
        branch2Value,
      }));
      return {
        statements: [
          ...statements.slice(0, statements.length - 1),
          {
            ...lastStatement,
            s1: s1Result.statements,
            s2: s2Result.statements,
            finalAssignments: [
              ...lastStatement.finalAssignments.filter((it) => it !== relaventFinalAssignment),
              ...newFinalAssignments,
            ],
          },
        ],
        functionArguments: newFinalAssignments.map((it) => MIR_VARIABLE(it.name, it.type)),
      };
    }

    default:
      return null;
  }
};

const getTailRecursionParameterName = (name: string): string => `_tailrec_param_${name}`;

const optimizeMidIRFunctionByTailRecursionRewrite = ({
  name,
  parameters,
  type,
  body,
  returnValue,
}: MidIRFunction): MidIRFunction | null => {
  if (returnValue.__type__ === 'MidIRNameExpression') return null;
  const allocator = new OptimizationResourceAllocator();
  const result = tryRewriteStatementsForTailRecursionWithoutUsingReturnValue(
    body,
    name,
    type.argumentTypes,
    returnValue.__type__ === 'MidIRIntLiteralExpression' ? null : returnValue.name,
    allocator
  );
  if (result == null) return null;
  const { statements, functionArguments } = result;
  if (returnValue.__type__ === 'MidIRIntLiteralExpression') {
    return {
      name,
      parameters: parameters.map(getTailRecursionParameterName),
      type,
      body: [
        MIR_WHILE({
          loopVariables: zip3(parameters, type.argumentTypes, functionArguments).map(
            ([loopVariableName, loopVariableType, loopValue]) => ({
              name: loopVariableName,
              type: loopVariableType,
              initialValue: MIR_VARIABLE(
                getTailRecursionParameterName(loopVariableName),
                loopVariableType
              ),
              loopValue,
            })
          ),
          statements,
        }),
      ],
      returnValue,
    };
  }

  return {
    name,
    parameters: parameters.map(getTailRecursionParameterName),
    type,
    body: [
      MIR_WHILE({
        loopVariables: zip3(parameters, type.argumentTypes, functionArguments).map(
          ([loopVariableName, loopVariableType, loopValue]) => ({
            name: loopVariableName,
            type: loopVariableType,
            initialValue: MIR_VARIABLE(
              getTailRecursionParameterName(loopVariableName),
              loopVariableType
            ),
            loopValue,
          })
        ),
        statements,
        breakCollector: { name: returnValue.name, type: returnValue.type },
      }),
    ],
    returnValue,
  };
};

export default optimizeMidIRFunctionByTailRecursionRewrite;
