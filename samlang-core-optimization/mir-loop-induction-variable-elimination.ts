import createMidIRFlexibleOrderOperatorNode from 'samlang-core-ast/mir-flexible-op';
import {
  MidIRExpression,
  MidIRStatement,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

import {
  MidIROptimizableWhileLoop,
  mergeInvariantMultiplicationForLoopOptimization,
} from './mir-loop-induction-analysis';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

export default function midIRLoopInductionVariableEliminationOptimization(
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: MidIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator
): {
  readonly prefixStatements: readonly MidIRStatement[];
  readonly optimizableWhileLoop: MidIROptimizableWhileLoop;
} | null {
  const expressionUsesBasicInductionVariableWithLoopGuard = (
    expression: MidIRExpression
  ): boolean =>
    expression.__type__ === 'MidIRVariableExpression' &&
    expression.name === basicInductionVariableWithLoopGuard.name;

  const statementUsesBasicInductionVariableWithLoopGuard = (statement: MidIRStatement): boolean => {
    switch (statement.__type__) {
      case 'MidIRIndexAccessStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.pointerExpression);
      case 'MidIRBinaryStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.e1) ||
          expressionUsesBasicInductionVariableWithLoopGuard(statement.e2)
        );
      case 'MidIRFunctionCallStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.functionExpression) ||
          statement.functionArguments.some(expressionUsesBasicInductionVariableWithLoopGuard)
        );
      case 'MidIRIfElseStatement':
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
      case 'MidIRSingleIfStatement':
        return (
          expressionUsesBasicInductionVariableWithLoopGuard(statement.booleanExpression) ||
          statement.statements.some(statementUsesBasicInductionVariableWithLoopGuard)
        );
      case 'MidIRBreakStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.breakValue);
      case 'MidIRWhileStatement':
        return (
          statement.loopVariables.some(
            (it) =>
              expressionUsesBasicInductionVariableWithLoopGuard(it.initialValue) ||
              expressionUsesBasicInductionVariableWithLoopGuard(it.loopValue)
          ) || statement.statements.some(statementUsesBasicInductionVariableWithLoopGuard)
        );
      case 'MidIRCastStatement':
        return expressionUsesBasicInductionVariableWithLoopGuard(statement.assignedExpression);
      case 'MidIRStructInitializationStatement':
        return statement.expressionList.some(expressionUsesBasicInductionVariableWithLoopGuard);
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
    MIR_BINARY({
      name: newInitialValueTempTemporary,
      ...createMidIRFlexibleOrderOperatorNode(
        '*',
        onlyRelevantDerivedInductionVariable.multiplier,
        basicInductionVariableWithLoopGuard.initialValue
      ),
    }),
    MIR_BINARY({
      name: newInitialValueName,
      ...createMidIRFlexibleOrderOperatorNode(
        '+',
        onlyRelevantDerivedInductionVariable.immediate,
        MIR_VARIABLE(newInitialValueTempTemporary, MIR_INT_TYPE)
      ),
    }),
    MIR_BINARY({
      name: newGuardValueTempTemporary,
      ...createMidIRFlexibleOrderOperatorNode(
        '*',
        onlyRelevantDerivedInductionVariable.multiplier,
        basicInductionVariableWithLoopGuard.guardExpression
      ),
    }),
    MIR_BINARY({
      name: newGuardValueName,
      ...createMidIRFlexibleOrderOperatorNode(
        '+',
        onlyRelevantDerivedInductionVariable.immediate,
        MIR_VARIABLE(newGuardValueTempTemporary, MIR_INT_TYPE)
      ),
    }),
  ];

  return {
    prefixStatements,
    optimizableWhileLoop: {
      basicInductionVariableWithLoopGuard: {
        name: onlyRelevantDerivedInductionVariable.name,
        initialValue: MIR_VARIABLE(newInitialValueName, MIR_INT_TYPE),
        incrementAmount: addedInvariantExpressionInLoop,
        guardOperator: '<',
        guardExpression: MIR_VARIABLE(newGuardValueName, MIR_INT_TYPE),
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
}
