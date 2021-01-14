import optimizeHighIRStatementsByCommonSubExpressionElimination from './hir-common-subexpression-elimination-optimization';
import optimizeHighIRStatementsByConditionalConstantPropagation from './hir-conditional-constant-propagation-optimization';
import optimizeHighIRStatementsByDeadCodeElimination from './hir-dead-code-elimination-optimization';
import optimizeHighIRFunctionsByInlining from './hir-inline-optimization';
import optimizeHighIRStatementsByLocalValueNumbering from './hir-local-value-numbering-optimization';
import optimizeHighIRModuleByEliminatingUnusedOnes from './hir-unused-name-elimination-optimization';
import OptimizationResourceAllocator from './optimization-resource-allocator';

import type { HighIRStatement } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';

export type OptimizationConfiguration = {
  doesPerformLocalValueNumbering?: boolean;
  doesPerformCommonSubExpressionElimination?: boolean;
  doesPerformInlining?: boolean;
};

const allEnabledOptimizationConfiguration: OptimizationConfiguration = {
  doesPerformLocalValueNumbering: true,
  doesPerformCommonSubExpressionElimination: true,
  doesPerformInlining: true,
};

const optimizeHighIRStatementsForOneRound = (
  statements: readonly HighIRStatement[],
  allocator: OptimizationResourceAllocator,
  {
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
  }: OptimizationConfiguration
): readonly HighIRStatement[] => {
  let optimized = optimizeHighIRStatementsByConditionalConstantPropagation(statements);
  // istanbul ignore next
  if (doesPerformLocalValueNumbering) {
    optimized = optimizeHighIRStatementsByLocalValueNumbering(optimized);
  }
  // istanbul ignore next
  if (doesPerformCommonSubExpressionElimination) {
    optimized = optimizeHighIRStatementsByCommonSubExpressionElimination(optimized, allocator);
  }
  return optimizeHighIRStatementsByDeadCodeElimination(optimized);
};

const optimizeFunctionForRounds = (
  highIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator,
  optimizationConfiguration: OptimizationConfiguration
): HighIRFunction => {
  let statements = highIRFunction.body;
  for (let j = 0; j < 5; j += 1) {
    statements = optimizeHighIRStatementsForOneRound(
      statements,
      allocator,
      optimizationConfiguration
    );
  }
  return {
    ...highIRFunction,
    body: optimizeHighIRStatementsByConditionalConstantPropagation(statements),
  };
};

const optimizeHighIRModule = (
  highIRModule: HighIRModule,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): HighIRModule => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = highIRModule;
  for (let i = 0; i < 4; i += 1) {
    let optimizedFunctions: readonly HighIRFunction[] = intermediate.functions.map((it) =>
      optimizeFunctionForRounds(it, allocator, optimizationConfiguration)
    );
    // istanbul ignore next
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

export default optimizeHighIRModule;
