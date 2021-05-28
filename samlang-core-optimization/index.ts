import optimizeMidIRFunctionByCommonSubExpressionElimination from './mir-common-subexpression-elimination-optimization';
import optimizeMidIRFunctionByConditionalConstantPropagation from './mir-conditional-constant-propagation-optimization';
import optimizeMidIRFunctionByDeadCodeElimination from './mir-dead-code-elimination-optimization';
import optimizeMidIRFunctionsByInlining from './mir-inline-optimization';
import optimizeMidIRFunctionByLocalValueNumbering from './mir-local-value-numbering-optimization';
import optimizeMidIRFunctionWithAllLoopOptimizations from './mir-loop-optimizations';
import optimizeMidIRFunctionByTailRecursionRewrite from './mir-tail-recursion-optimization';
import optimizeMidIRModuleByEliminatingUnusedOnes from './mir-unused-name-elimination-optimization';
import OptimizationResourceAllocator from './optimization-resource-allocator';

import type { MidIRFunction, MidIRModule } from 'samlang-core-ast/mir-nodes';

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
  return optimizeMidIRFunctionByDeadCodeElimination(
    optimizeMidIRFunctionByConditionalConstantPropagation(optimizedFunction)
  );
};

export const optimizeMidIRModuleByUnusedNameEliminationAndTailRecursionRewrite = (
  midIRModule: MidIRModule
): MidIRModule => {
  const intermediate = optimizeMidIRModuleByEliminatingUnusedOnes(midIRModule);
  return {
    ...intermediate,
    functions: intermediate.functions.map(
      (it) => optimizeMidIRFunctionByTailRecursionRewrite(it) ?? it
    ),
  };
};

export const optimizeMidIRModuleAccordingToConfiguration = (
  midIRModule: MidIRModule,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): MidIRModule => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = midIRModule;
  for (let i = 0; i < 4; i += 1) {
    let optimizedFunctions: readonly MidIRFunction[] = intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration)
    );
    if (optimizationConfiguration.doesPerformInlining) {
      optimizedFunctions = optimizeMidIRFunctionsByInlining(optimizedFunctions, allocator);
    }
    intermediate = optimizeMidIRModuleByEliminatingUnusedOnes({
      ...midIRModule,
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
