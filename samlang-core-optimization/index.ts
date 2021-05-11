import optimizeHighIRFunctionByCommonSubExpressionElimination from './hir-common-subexpression-elimination-optimization';
import optimizeHighIRFunctionByConditionalConstantPropagation from './hir-conditional-constant-propagation-optimization';
import optimizeHighIRFunctionByDeadCodeElimination from './hir-dead-code-elimination-optimization';
import optimizeHighIRFunctionsByInlining from './hir-inline-optimization';
import optimizeHighIRFunctionByLocalValueNumbering from './hir-local-value-numbering-optimization';
import optimizeHighIRFunctionWithAllLoopOptimizations from './hir-loop-optimizations';
import optimizeHighIRFunctionByTailRecursionRewrite from './hir-tail-recursion-optimization';
import optimizeHighIRModuleByEliminatingUnusedOnes from './hir-unused-name-elimination-optimization';
import OptimizationResourceAllocator from './optimization-resource-allocator';

import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';

export type OptimizationConfiguration = {
  doesPerformLocalValueNumbering?: boolean;
  doesPerformCommonSubExpressionElimination?: boolean;
  doesPerformLoopOptimization?: boolean;
  doesPerformInlining?: boolean;
};

const allEnabledOptimizationConfiguration: OptimizationConfiguration = {
  doesPerformLocalValueNumbering: true,
  doesPerformCommonSubExpressionElimination: true,
  doesPerformLoopOptimization: true,
  doesPerformInlining: true,
};

const optimizeHighIRFunctionForOneRound = (
  highIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator,
  {
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
    doesPerformLoopOptimization,
  }: OptimizationConfiguration
): HighIRFunction => {
  let optimizedFunction = optimizeHighIRFunctionByConditionalConstantPropagation(highIRFunction);
  if (doesPerformLoopOptimization) {
    optimizedFunction = optimizeHighIRFunctionWithAllLoopOptimizations(
      optimizedFunction,
      allocator
    );
  }
  if (doesPerformLocalValueNumbering) {
    optimizedFunction = optimizeHighIRFunctionByLocalValueNumbering(optimizedFunction);
  }
  if (doesPerformCommonSubExpressionElimination) {
    optimizedFunction = optimizeHighIRFunctionByCommonSubExpressionElimination(
      optimizedFunction,
      allocator
    );
  }
  return optimizeHighIRFunctionByDeadCodeElimination(optimizedFunction);
};

const optimizeFunctionForRounds = (
  highIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator,
  optimizationConfiguration: OptimizationConfiguration
): HighIRFunction => {
  let optimizedFunction = highIRFunction;
  for (let j = 0; j < 5; j += 1) {
    optimizedFunction = optimizeHighIRFunctionForOneRound(
      optimizedFunction,
      allocator,
      optimizationConfiguration
    );
  }
  return optimizeHighIRFunctionByDeadCodeElimination(
    optimizeHighIRFunctionByConditionalConstantPropagation(optimizedFunction)
  );
};

export const optimizeHighIRModuleByUnusedNameEliminationAndTailRecursionRewrite = (
  highIRModule: HighIRModule
): HighIRModule => {
  const intermediate = optimizeHighIRModuleByEliminatingUnusedOnes(highIRModule);
  return {
    ...intermediate,
    functions: intermediate.functions.map(
      (it) => optimizeHighIRFunctionByTailRecursionRewrite(it) ?? it
    ),
  };
};

export const optimizeHighIRModuleAccordingToConfiguration = (
  highIRModule: HighIRModule,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): HighIRModule => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = highIRModule;
  for (let i = 0; i < 4; i += 1) {
    let optimizedFunctions: readonly HighIRFunction[] = intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration)
    );
    if (optimizationConfiguration.doesPerformInlining) {
      optimizedFunctions = optimizeHighIRFunctionsByInlining(optimizedFunctions, allocator);
    }
    intermediate = optimizeHighIRModuleByEliminatingUnusedOnes({
      ...highIRModule,
      functions: optimizedFunctions,
    });
  }

  return {
    ...intermediate,
    functions: intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration)
    ),
  };
};
