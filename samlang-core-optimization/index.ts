import type { MidIRFunction, MidIRSources } from 'samlang-core-ast/mir-nodes';

import optimizeMidIRFunctionByCommonSubExpressionElimination from './mir-common-subexpression-elimination-optimization';
import optimizeMidIRFunctionByConditionalConstantPropagation from './mir-conditional-constant-propagation-optimization';
import optimizeMidIRFunctionByDeadCodeElimination from './mir-dead-code-elimination-optimization';
import optimizeMidIRFunctionsByInlining from './mir-inline-optimization';
import optimizeMidIRFunctionByLocalValueNumbering from './mir-local-value-numbering-optimization';
import optimizeMidIRFunctionWithAllLoopOptimizations from './mir-loop-optimizations';
import optimizeMidIRFunctionByTailRecursionRewrite from './mir-tail-recursion-optimization';
import optimizeMidIRSourcesByEliminatingUnusedOnes from './mir-unused-name-elimination-optimization';
import OptimizationResourceAllocator from './optimization-resource-allocator';

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

const optimizeMidIRFunctionForOneRound = (
  midIRFunction: MidIRFunction,
  allocator: OptimizationResourceAllocator,
  {
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
    doesPerformLoopOptimization,
  }: OptimizationConfiguration
): MidIRFunction => {
  let optimizedFunction = optimizeMidIRFunctionByConditionalConstantPropagation(midIRFunction);
  if (doesPerformLoopOptimization) {
    optimizedFunction = optimizeMidIRFunctionWithAllLoopOptimizations(optimizedFunction, allocator);
  }
  if (doesPerformLocalValueNumbering) {
    optimizedFunction = optimizeMidIRFunctionByLocalValueNumbering(optimizedFunction);
  }
  if (doesPerformCommonSubExpressionElimination) {
    optimizedFunction = optimizeMidIRFunctionByCommonSubExpressionElimination(
      optimizedFunction,
      allocator
    );
  }
  return optimizeMidIRFunctionByDeadCodeElimination(optimizedFunction);
};

const optimizeFunctionForRounds = (
  midIRFunction: MidIRFunction,
  allocator: OptimizationResourceAllocator,
  optimizationConfiguration: OptimizationConfiguration
): MidIRFunction => {
  let optimizedFunction = midIRFunction;
  for (let j = 0; j < 5; j += 1) {
    optimizedFunction = optimizeMidIRFunctionForOneRound(
      optimizedFunction,
      allocator,
      optimizationConfiguration
    );
  }
  return optimizeMidIRFunctionByConditionalConstantPropagation(
    optimizeMidIRFunctionByDeadCodeElimination(
      optimizeMidIRFunctionByConditionalConstantPropagation(optimizedFunction)
    )
  );
};

export const optimizeMidIRSourcesByTailRecursionRewrite = (
  sources: MidIRSources
): MidIRSources => ({
  ...sources,
  functions: sources.functions.map((it) => optimizeMidIRFunctionByTailRecursionRewrite(it) ?? it),
});

export { optimizeMidIRSourcesByEliminatingUnusedOnes };

export const optimizeMidIRSourcesAccordingToConfiguration = (
  sources: MidIRSources,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): MidIRSources => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = sources;
  for (let i = 0; i < 4; i += 1) {
    let optimizedFunctions: readonly MidIRFunction[] = intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration)
    );
    if (optimizationConfiguration.doesPerformInlining) {
      optimizedFunctions = optimizeMidIRFunctionsByInlining(optimizedFunctions, allocator);
    }
    intermediate = optimizeMidIRSourcesByEliminatingUnusedOnes({
      ...sources,
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
