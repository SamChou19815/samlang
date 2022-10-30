import createHighIRFlexibleOrderOperatorNode from "../ast/hir-flexible-op";
import { HighIRStatement, HIR_BINARY, HIR_INT_TYPE, HIR_VARIABLE } from "../ast/hir-nodes";
import { checkNotNull, filterMap } from "../utils";
import {
  GeneralBasicInductionVariable,
  HighIROptimizableWhileLoop,
  mergeInvariantMultiplicationForLoopOptimization,
} from "./hir-loop-induction-analysis";
import type OptimizationResourceAllocator from "./optimization-resource-allocator";

export default function highIRLoopStrengthReductionOptimization(
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: HighIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator,
): {
  readonly prefixStatements: readonly HighIRStatement[];
  readonly optimizableWhileLoop: HighIROptimizableWhileLoop;
} {
  const basicInductionVariablesMap = new Map<string, GeneralBasicInductionVariable>([
    [basicInductionVariableWithLoopGuard.name, basicInductionVariableWithLoopGuard],
  ]);
  generalInductionVariables.forEach((it) => {
    basicInductionVariablesMap.set(it.name, it);
  });
  const prefixStatements: HighIRStatement[] = [];
  const newGeneralInductionVariables: GeneralBasicInductionVariable[] = [];
  const remainingDerivedInductionVariables = filterMap(
    derivedInductionVariables,
    (derivedInductionVariable) => {
      const associatedBasicInductionVariable = checkNotNull(
        basicInductionVariablesMap.get(derivedInductionVariable.baseName),
        `Missing ${derivedInductionVariable.baseName}`,
      );
      const addedInvariantExpressionInLoop = mergeInvariantMultiplicationForLoopOptimization(
        associatedBasicInductionVariable.incrementAmount,
        derivedInductionVariable.multiplier,
      );
      if (addedInvariantExpressionInLoop == null) return derivedInductionVariable;

      const newInitialValueTempTemporary = allocator.allocateLoopTemporary();
      const newInitialValueName = allocator.allocateLoopTemporary();
      prefixStatements.push(
        HIR_BINARY({
          name: newInitialValueTempTemporary,
          ...createHighIRFlexibleOrderOperatorNode(
            "*",
            derivedInductionVariable.multiplier,
            associatedBasicInductionVariable.initialValue,
          ),
        }),
        HIR_BINARY({
          name: newInitialValueName,
          ...createHighIRFlexibleOrderOperatorNode(
            "+",
            derivedInductionVariable.immediate,
            HIR_VARIABLE(newInitialValueTempTemporary, HIR_INT_TYPE),
          ),
        }),
      );
      newGeneralInductionVariables.push({
        name: derivedInductionVariable.name,
        initialValue: HIR_VARIABLE(newInitialValueName, HIR_INT_TYPE),
        incrementAmount: addedInvariantExpressionInLoop,
      });
      return null;
    },
  );

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
}
