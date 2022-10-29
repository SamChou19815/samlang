import type { HighIRFunction, HighIRSources } from "../ast/hir-nodes";
import optimizeHighIRFunctionByCommonSubExpressionElimination from "./hir-common-subexpression-elimination-optimization";
import optimizeHighIRFunctionByConditionalConstantPropagation from "./hir-conditional-constant-propagation-optimization";
import optimizeHighIRFunctionByDeadCodeElimination from "./hir-dead-code-elimination-optimization";
import optimizeHighIRFunctionsByInlining from "./hir-inline-optimization";
import optimizeHighIRFunctionByLocalValueNumbering from "./hir-local-value-numbering-optimization";
import optimizeHighIRFunctionWithAllLoopOptimizations from "./hir-loop-optimizations";
import optimizeHighIRSourcesByEliminatingUnusedOnes from "./hir-unused-name-elimination-optimization";
import OptimizationResourceAllocator from "./optimization-resource-allocator";

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

function optimizeHighIRFunctionForOneRound(
  highIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator,
  {
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
    doesPerformLoopOptimization,
  }: OptimizationConfiguration,
): HighIRFunction {
  let optimizedFunction = optimizeHighIRFunctionByConditionalConstantPropagation(highIRFunction);
  if (doesPerformLoopOptimization) {
    optimizedFunction = optimizeHighIRFunctionWithAllLoopOptimizations(
      optimizedFunction,
      allocator,
    );
  }
  if (doesPerformLocalValueNumbering) {
    optimizedFunction = optimizeHighIRFunctionByLocalValueNumbering(optimizedFunction);
  }
  if (doesPerformCommonSubExpressionElimination) {
    optimizedFunction = optimizeHighIRFunctionByCommonSubExpressionElimination(
      optimizedFunction,
      allocator,
    );
  }
  return optimizeHighIRFunctionByDeadCodeElimination(optimizedFunction);
}

function optimizeFunctionForRounds(
  highIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator,
  optimizationConfiguration: OptimizationConfiguration,
): HighIRFunction {
  let optimizedFunction = highIRFunction;
  for (let j = 0; j < 5; j += 1) {
    optimizedFunction = optimizeHighIRFunctionForOneRound(
      optimizedFunction,
      allocator,
      optimizationConfiguration,
    );
  }
  return optimizeHighIRFunctionByConditionalConstantPropagation(
    optimizeHighIRFunctionByDeadCodeElimination(
      optimizeHighIRFunctionByConditionalConstantPropagation(optimizedFunction),
    ),
  );
}

export function optimizeHighIRSourcesAccordingToConfiguration(
  sources: HighIRSources,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration,
): HighIRSources {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = sources;
  for (let i = 0; i < 4; i += 1) {
    let optimizedFunctions: readonly HighIRFunction[] = intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration),
    );
    if (optimizationConfiguration.doesPerformInlining) {
      optimizedFunctions = optimizeHighIRFunctionsByInlining(optimizedFunctions, allocator);
    }
    intermediate = optimizeHighIRSourcesByEliminatingUnusedOnes({
      ...sources,
      functions: optimizedFunctions,
    });
  }

  return {
    ...intermediate,
    functions: intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration),
    ),
  };
}
