import OptimizationResourceAllocator from './optimization-resource-allocator';

import {
  HighIRExpression,
  HighIRStatement,
  HIR_FALSE,
  HIR_TRUE,
  HIR_ZERO,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_WHILE,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { HighIRType, HIR_BOOL_TYPE } from 'samlang-core-ast/hir-types';
import { Long, assert, checkNotNull, zip, zip3 } from 'samlang-core-utils';

type RewriteResult = {
  readonly statements: readonly HighIRStatement[];
  readonly functionArguments: readonly HighIRExpression[];
  readonly conditionValue: HighIRExpression;
};

const getStatements = (
  result: RewriteResult | null,
  backup: readonly HighIRStatement[]
): readonly HighIRStatement[] => result?.statements ?? backup;

const tryRewriteStatementsForTailRecursionWithoutUsingReturnValue = (
  statements: readonly HighIRStatement[],
  functionName: string,
  functionParameterTypes: readonly HighIRType[],
  expectedReturnCollector: string | null,
  allocator: OptimizationResourceAllocator
): RewriteResult | null => {
  const lastStatement = statements[statements.length - 1];
  if (lastStatement == null) return null;

  const getFunctionArgumentsFromResultOrDummyOnes = (
    result: RewriteResult | null
  ): readonly HighIRExpression[] =>
    result?.functionArguments ??
    functionParameterTypes.map((type) => ({
      __type__: 'HighIRIntLiteralExpression',
      value: Long.ZERO,
      type,
    }));

  const getConditionValueFromResult = (result: RewriteResult | null): HighIRExpression =>
    result?.conditionValue ?? HIR_FALSE;

  switch (lastStatement.__type__) {
    case 'HighIRFunctionCallStatement':
      if (
        lastStatement.functionExpression.__type__ !== 'HighIRNameExpression' ||
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
                HIR_BINARY({
                  name: expectedReturnCollector,
                  operator: '+',
                  e1: HIR_ZERO,
                  e2: HIR_ZERO,
                }),
              ],
        functionArguments: lastStatement.functionArguments,
        conditionValue: HIR_TRUE,
      };

    case 'HighIRIfElseStatement': {
      let newExpectedReturnCollector: readonly [string | null, string | null] = [null, null];
      if (expectedReturnCollector != null) {
        const relaventFinalAssignment = lastStatement.finalAssignments.find(
          (it) => it.name === expectedReturnCollector
        );
        if (relaventFinalAssignment == null) return null;
        const { branch1Value, branch2Value } = relaventFinalAssignment;
        newExpectedReturnCollector = [
          branch1Value.__type__ === 'HighIRVariableExpression' ? branch1Value.name : null,
          branch2Value.__type__ === 'HighIRVariableExpression' ? branch2Value.name : null,
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
      const newFinalAssignments = zip3(
        getFunctionArgumentsFromResultOrDummyOnes(s1Result),
        getFunctionArgumentsFromResultOrDummyOnes(s2Result),
        functionParameterTypes
      ).map(([branch1Value, branch2Value, type]) => {
        const name = allocator.allocateTailRecTemporary();
        return { name, type, branch1Value, branch2Value };
      });
      const conditionValueName = allocator.allocateTailRecTemporary();
      return {
        statements: [
          ...statements.slice(0, statements.length - 1),
          {
            ...lastStatement,
            s1: getStatements(s1Result, lastStatement.s1),
            s2: getStatements(s2Result, lastStatement.s2),
            finalAssignments: [
              ...lastStatement.finalAssignments,
              ...newFinalAssignments,
              {
                name: conditionValueName,
                type: HIR_BOOL_TYPE,
                branch1Value: getConditionValueFromResult(s1Result),
                branch2Value: getConditionValueFromResult(s2Result),
              },
            ],
          },
        ],
        functionArguments: newFinalAssignments.map((it) => HIR_VARIABLE(it.name, it.type)),
        conditionValue: HIR_VARIABLE(conditionValueName, HIR_BOOL_TYPE),
      };
    }

    case 'HighIRSwitchStatement': {
      let newExpectedReturnCollector: readonly (string | null)[] = lastStatement.cases.map(
        () => null
      );
      if (expectedReturnCollector != null) {
        const relaventFinalAssignment = lastStatement.finalAssignments.find(
          (it) => it.name === expectedReturnCollector
        );
        if (relaventFinalAssignment == null) return null;
        newExpectedReturnCollector = relaventFinalAssignment.branchValues.map((it) =>
          it.__type__ === 'HighIRVariableExpression' ? it.name : null
        );
      }
      const caseResults = zip(
        lastStatement.cases,
        newExpectedReturnCollector
      ).map(([oneCase, collector]) =>
        tryRewriteStatementsForTailRecursionWithoutUsingReturnValue(
          oneCase.statements,
          functionName,
          functionParameterTypes,
          collector,
          allocator
        )
      );
      if (caseResults.every((it) => it == null)) return null;
      const cases = zip(lastStatement.cases, caseResults).map(([oneCase, caseResult]) => ({
        ...oneCase,
        statements: getStatements(caseResult, oneCase.statements),
      }));
      const finalArgumentsOrDummyOnes = caseResults.map(getFunctionArgumentsFromResultOrDummyOnes);
      const newFinalAssignments = functionParameterTypes.map((type, i) => {
        const name = allocator.allocateTailRecTemporary();
        const branchValues = finalArgumentsOrDummyOnes.map((it) => checkNotNull(it[i]));
        return { name, type, branchValues };
      });
      const conditionValueName = allocator.allocateTailRecTemporary();
      return {
        statements: [
          ...statements.slice(0, statements.length - 1),
          {
            ...lastStatement,
            cases,
            finalAssignments: [
              ...lastStatement.finalAssignments,
              ...newFinalAssignments,
              {
                name: conditionValueName,
                type: HIR_BOOL_TYPE,
                branchValues: caseResults.map(getConditionValueFromResult),
              },
            ],
          },
        ],
        functionArguments: newFinalAssignments.map((it) => HIR_VARIABLE(it.name, it.type)),
        conditionValue: HIR_VARIABLE(conditionValueName, HIR_BOOL_TYPE),
      };
    }

    default:
      return null;
  }
};

const getTailRecursionParameterName = (name: string): string => `_tailrec_param_${name}`;

const optimizeHighIRFunctionByTailRecursionRewrite = ({
  name,
  parameters,
  type,
  body,
}: HighIRFunction): HighIRFunction | null => {
  const lastStatement = body[body.length - 1];
  assert(
    lastStatement != null && lastStatement.__type__ === 'HighIRReturnStatement',
    'Last statement of a compiled HighIR function must be return!'
  );
  const returnedExpression = lastStatement.expression;
  if (returnedExpression.__type__ === 'HighIRNameExpression') return null;
  const allocator = new OptimizationResourceAllocator();
  const result = tryRewriteStatementsForTailRecursionWithoutUsingReturnValue(
    body.slice(0, body.length - 1),
    name,
    type.argumentTypes,
    returnedExpression.__type__ === 'HighIRIntLiteralExpression' ? null : returnedExpression.name,
    allocator
  );
  if (result == null) return null;
  const { statements, functionArguments, conditionValue } = result;
  if (returnedExpression.__type__ === 'HighIRIntLiteralExpression') {
    return {
      name,
      parameters: parameters.map(getTailRecursionParameterName),
      type,
      body: [
        HIR_WHILE({
          loopVariables: zip3(parameters, type.argumentTypes, functionArguments).map(
            ([loopVariableName, loopVariableType, loopValue]) => ({
              name: loopVariableName,
              type: loopVariableType,
              initialValue: HIR_VARIABLE(
                getTailRecursionParameterName(loopVariableName),
                loopVariableType
              ),
              loopValue,
            })
          ),
          statements,
          conditionValue,
        }),
        lastStatement,
      ],
    };
  }

  const returnAssignmentName = allocator.allocateTailRecTemporary();
  return {
    name,
    parameters: parameters.map(getTailRecursionParameterName),
    type,
    body: [
      HIR_WHILE({
        loopVariables: zip3(parameters, type.argumentTypes, functionArguments).map(
          ([loopVariableName, loopVariableType, loopValue]) => ({
            name: loopVariableName,
            type: loopVariableType,
            initialValue: HIR_VARIABLE(
              getTailRecursionParameterName(loopVariableName),
              loopVariableType
            ),
            loopValue,
          })
        ),
        statements,
        conditionValue,
        returnAssignment: {
          name: returnAssignmentName,
          type: returnedExpression.type,
          value: returnedExpression,
        },
      }),
      HIR_RETURN(HIR_VARIABLE(returnAssignmentName, returnedExpression.type)),
    ],
  };
};

export default optimizeHighIRFunctionByTailRecursionRewrite;
