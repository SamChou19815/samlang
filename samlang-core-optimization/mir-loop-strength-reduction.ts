import createMidIRFlexibleOrderOperatorNode from 'samlang-core-ast/mir-flexible-op';
import { MidIRStatement, MIR_VARIABLE, MIR_BINARY, MIR_INT_TYPE } from 'samlang-core-ast/mir-nodes';
import { checkNotNull, isNotNull } from 'samlang-core-utils';

import {
  GeneralBasicInductionVariable,
  MidIROptimizableWhileLoop,
  mergeInvariantMultiplicationForLoopOptimization,
} from './mir-loop-induction-analysis';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

const midIRLoopStrengthReductionOptimization = (
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
} => {
  const basicInductionVariablesMap: Record<string, GeneralBasicInductionVariable> = {
    [basicInductionVariableWithLoopGuard.name]: basicInductionVariableWithLoopGuard,
  };
  generalInductionVariables.forEach((it) => {
    basicInductionVariablesMap[it.name] = it;
  });
  const prefixStatements: MidIRStatement[] = [];
  const newGeneralInductionVariables: GeneralBasicInductionVariable[] = [];
  const remainingDerivedInductionVariables = derivedInductionVariables
    .map((derivedInductionVariable) => {
      const associatedBasicInductionVariable = checkNotNull(
        basicInductionVariablesMap[derivedInductionVariable.baseName],
        `Missing ${derivedInductionVariable.baseName}`
      );
      const addedInvariantExpressionInLoop = mergeInvariantMultiplicationForLoopOptimization(
        associatedBasicInductionVariable.incrementAmount,
        derivedInductionVariable.multiplier
      );
      if (addedInvariantExpressionInLoop == null) return derivedInductionVariable;

      const newInitialValueTempTemporary = allocator.allocateLoopTemporary();
      const newInitialValueName = allocator.allocateLoopTemporary();
      prefixStatements.push(
        MIR_BINARY({
          name: newInitialValueTempTemporary,
          ...createMidIRFlexibleOrderOperatorNode(
            '*',
            derivedInductionVariable.multiplier,
            associatedBasicInductionVariable.initialValue
          ),
        }),
        MIR_BINARY({
          name: newInitialValueName,
          ...createMidIRFlexibleOrderOperatorNode(
            '+',
            derivedInductionVariable.immediate,
            MIR_VARIABLE(newInitialValueTempTemporary, MIR_INT_TYPE)
          ),
        })
      );
      newGeneralInductionVariables.push({
        name: derivedInductionVariable.name,
        initialValue: MIR_VARIABLE(newInitialValueName, MIR_INT_TYPE),
        incrementAmount: addedInvariantExpressionInLoop,
      });
      return null;
    })
    .filter(isNotNull);

  return {
    prefixStatements,
    optimizableWhileLoop: {
      basicInductionVariableWithLoopGuard,
      generalInductionVariables: [...generalInductionVariables, ...newGeneralInductionVariables],
      loopVariablesThatAreNotBasicInductionVariables,
      derivedInductionVariables: remainingDerivedInductionVariables,
      statements,
      breakCollector,
    },
  };
};

export default midIRLoopStrengthReductionOptimization;
