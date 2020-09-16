import type { MidIRStatement, MidIRCompilationUnit } from '../ast/mir-nodes';
import optimizeIRWithAlgebraicSimplification from './algebraic-optimization';
import optimizeIRWithCommonSubExpressionElimination from './common-subexpression-elimination-optimization';
import optimizeIRWithConstantFolding from './constant-folding-optimization';
import optimizeIRWithConstantPropagation from './constant-propagation-optimization';
import optimizeIRWithCopyPropagation from './copy-propagation-optimization';
import optimizeIRWithDeadCodeElimination from './dead-code-elimination-optimization';
import optimizeMidIRCompilationUnitByInlining from './inline-optimization';
import optimizeIRWithLocalValueNumbering from './local-value-numbering-optimization';
import OptimizationResourceAllocator from './optimization-resource-allocator';
import { optimizeIrWithSimpleOptimization } from './simple-optimizations';

type OptimizationConfiguration = {
  doesPerformCopyPropagation?: boolean;
  doesPerformLocalValueNumbering?: boolean;
  doesPerformCommonSubExpressionElimination?: boolean;
  doesPerformInlining?: boolean;
};

const allEnabledOptimizationConfiguration: OptimizationConfiguration = {
  doesPerformCopyPropagation: true,
  doesPerformLocalValueNumbering: true,
  doesPerformCommonSubExpressionElimination: true,
  doesPerformInlining: true,
};

const optimizeMidIRStatementsForOneRound = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator,
  {
    doesPerformCopyPropagation,
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
  }: OptimizationConfiguration
): readonly MidIRStatement[] => {
  let optimized = optimizeIRWithConstantFolding(
    optimizeIRWithAlgebraicSimplification(optimizeIRWithConstantPropagation(statements))
  );
  if (doesPerformCopyPropagation) {
    optimized = optimizeIRWithCopyPropagation(optimized);
  }
  if (doesPerformLocalValueNumbering) {
    optimized = optimizeIrWithSimpleOptimization(optimized);
    optimized = optimizeIRWithLocalValueNumbering(optimized);
  }
  if (doesPerformCommonSubExpressionElimination) {
    optimized = optimizeIRWithCommonSubExpressionElimination(optimized, allocator);
  }
  optimized = optimizeIRWithDeadCodeElimination(optimized);
  return optimizeIrWithSimpleOptimization(optimized);
};

const optimizeIRCompilationUnit = (
  source: MidIRCompilationUnit,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): MidIRCompilationUnit => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = source;
  for (let i = 0; i < 4; i += 1) {
    const newFunctions = intermediate.functions.map((midIRFunction) => {
      let statements = midIRFunction.mainBodyStatements;
      for (let j = 0; j < 5; j += 1) {
        statements = optimizeMidIRStatementsForOneRound(
          statements,
          allocator,
          optimizationConfiguration
        );
      }
      return {
        ...midIRFunction,
        mainBodyStatements: statements,
      };
    });
    intermediate = { ...intermediate, functions: newFunctions };
    if (optimizationConfiguration.doesPerformInlining) {
      intermediate = optimizeMidIRCompilationUnitByInlining(intermediate, allocator);
    }
  }

  return intermediate;
};

export default optimizeIRCompilationUnit;
