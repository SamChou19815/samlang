import {
  HighIROptimizableWhileLoop,
  mergeInvariantMultiplicationForLoopOptimization,
} from './hir-loop-induction-analysis';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

import {
  HighIRExpression,
  HighIRStatement,
  HIR_VARIABLE,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import createHighIRFlexibleOrderOperatorNode from 'samlang-core-ast/hir-flexible-op';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import { checkNotNull } from 'samlang-core-utils';

const highIRLoopInductionVariableEliminationOptimization = (
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: HighIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator
): {
  readonly prefixStatements: readonly HighIRStatement[];
  readonly optimizableWhileLoop: HighIROptimizableWhileLoop;
} | null => {
  const expressionUsesBasicInductionVariableWithLoopGuard = (
    expression: HighIRExpression
  ): boolean =>
    expression.__type__ === 'HighIRVariableExpression' &&
    expression.name === basicInductionVariableWithLoopGuard.name;

  const statementUsesBasicInductionVariableWithLoopGuard = (
    statement: HighIRStatement
  ): boolean => {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.pointerExpression);
      case 'HighIRBinaryStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.e1) ||
          expressionUsesBasicInductionVariableWithLoopGuard(statement.e2)
        );
      case 'HighIRFunctionCallStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.functionExpression) ||
          statement.functionArguments.some(expressionUsesBasicInductionVariableWithLoopGuard)
        );
      case 'HighIRIfElseStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.booleanExpression) ||
          statement.s1.some(statementUsesBasicInductionVariableWithLoopGuard) ||
          statement.s2.some(statementUsesBasicInductionVariableWithLoopGuard) ||
          statement.finalAssignments.some(
            (it) =>
              expressionUsesBasicInductionVariableWithLoopGuard(it.branch1Value) ||
              expressionUsesBasicInductionVariableWithLoopGuard(it.branch2Value)
          )
        );
      case 'HighIRSingleIfStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.booleanExpression) ||
          statement.statements.some(statementUsesBasicInductionVariableWithLoopGuard)
        );
      case 'HighIRBreakStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.breakValue);
      case 'HighIRWhileStatement':
        return (
          statement.loopVariables.some(
            (it) =>
              expressionUsesBasicInductionVariableWithLoopGuard(it.initialValue) ||
              expressionUsesBasicInductionVariableWithLoopGuard(it.loopValue)
          ) || statement.statements.some(statementUsesBasicInductionVariableWithLoopGuard)
        );
      case 'HighIRCastStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.assignedExpression);
      case 'HighIRStructInitializationStatement':
        return statement.expressionList.some(expressionUsesBasicInductionVariableWithLoopGuard);
      case 'HighIRReturnStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.expression);
    }
  };

  if (
    statements.some(statementUsesBasicInductionVariableWithLoopGuard) ||
    loopVariablesThatAreNotBasicInductionVariables.some((it) =>
      expressionUsesBasicInductionVariableWithLoopGuard(it.loopValue)
    ) ||
    (breakCollector != null &&
      expressionUsesBasicInductionVariableWithLoopGuard(breakCollector.value))
  ) {
    return null;
  }

  const relevantDerivedInductionLoopVariables = derivedInductionVariables.filter(
    (it) => it.baseName === basicInductionVariableWithLoopGuard.name
  );
  if (relevantDerivedInductionLoopVariables.length !== 1) return null;
  const onlyRelevantDerivedInductionVariable = checkNotNull(
    relevantDerivedInductionLoopVariables[0]
  );
  const addedInvariantExpressionInLoop = mergeInvariantMultiplicationForLoopOptimization(
    basicInductionVariableWithLoopGuard.incrementAmount,
    onlyRelevantDerivedInductionVariable.multiplier
  );
  if (addedInvariantExpressionInLoop == null) return null;

  const newInitialValueTempTemporary = allocator.allocateLoopTemporary();
  const newInitialValueName = allocator.allocateLoopTemporary();
  const newGuardValueTempTemporary = allocator.allocateLoopTemporary();
  const newGuardValueName = allocator.allocateLoopTemporary();
  const prefixStatements = [
    HIR_BINARY({
      name: newInitialValueTempTemporary,
      ...createHighIRFlexibleOrderOperatorNode(
        '*',
        onlyRelevantDerivedInductionVariable.multiplier,
        basicInductionVariableWithLoopGuard.initialValue
      ),
    }),
    HIR_BINARY({
      name: newInitialValueName,
      ...createHighIRFlexibleOrderOperatorNode(
        '+',
        onlyRelevantDerivedInductionVariable.immediate,
        HIR_VARIABLE(newInitialValueTempTemporary, HIR_INT_TYPE)
      ),
    }),
    HIR_BINARY({
      name: newGuardValueTempTemporary,
      ...createHighIRFlexibleOrderOperatorNode(
        '*',
        onlyRelevantDerivedInductionVariable.multiplier,
        basicInductionVariableWithLoopGuard.guardExpression
      ),
    }),
    HIR_BINARY({
      name: newGuardValueName,
      ...createHighIRFlexibleOrderOperatorNode(
        '+',
        onlyRelevantDerivedInductionVariable.immediate,
        HIR_VARIABLE(newGuardValueTempTemporary, HIR_INT_TYPE)
      ),
    }),
  ];

  return {
    prefixStatements,
    optimizableWhileLoop: {
      basicInductionVariableWithLoopGuard: {
        name: onlyRelevantDerivedInductionVariable.name,
        initialValue: HIR_VARIABLE(newInitialValueName, HIR_INT_TYPE),
        incrementAmount: addedInvariantExpressionInLoop,
        guardOperator: '<',
        guardExpression: HIR_VARIABLE(newGuardValueName, HIR_INT_TYPE),
      },
      generalInductionVariables,
      loopVariablesThatAreNotBasicInductionVariables,
      derivedInductionVariables: derivedInductionVariables.filter(
        (it) => it.name !== onlyRelevantDerivedInductionVariable.name
      ),
      statements,
      breakCollector,
    },
  };
};

export default highIRLoopInductionVariableEliminationOptimization;
