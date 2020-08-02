import { MidIRStatement, MidIRCompilationUnit } from '../ast/mir';
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
import optimizeIRWithTailRecursiveCallTransformation from './tail-recursion-optimization';

type OptimizationConfiguration = {
  doesPerformConstantPropagation?: boolean;
  doesPerformCopyPropagation?: boolean;
  doesPerformLocalValueNumbering?: boolean;
  doesPerformCommonSubExpressionElimination?: boolean;
  doesPerformDeadCodeElimination?: boolean;
  doesPerformInlining?: boolean;
};

const allEnabledOptimizationConfiguration: OptimizationConfiguration = {
  doesPerformConstantPropagation: true,
  doesPerformCopyPropagation: true,
  doesPerformLocalValueNumbering: true,
  doesPerformCommonSubExpressionElimination: true,
  doesPerformDeadCodeElimination: true,
  doesPerformInlining: true,
};

const optimizeMidIRStatementsForOneRound = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator,
  {
    doesPerformConstantPropagation,
    doesPerformCopyPropagation,
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
    doesPerformDeadCodeElimination,
  }: OptimizationConfiguration
): readonly MidIRStatement[] => {
  let optimized = doesPerformConstantPropagation
    ? optimizeIRWithConstantPropagation(statements)
    : statements;
  optimized = optimizeIRWithConstantFolding(optimizeIRWithAlgebraicSimplification(optimized));
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
  if (doesPerformDeadCodeElimination) {
    optimized = optimizeIRWithDeadCodeElimination(optimized);
  }
  return optimizeIrWithSimpleOptimization(optimized);
};

const optimizeIRCompilationUnit = (
  source: MidIRCompilationUnit,
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): MidIRCompilationUnit => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = source;
  for (let i = 0; i < 2; i += 1) {
    const newFunctions = intermediate.functions.map((midIRFunction) => {
      let statements = midIRFunction.mainBodyStatements;
      for (let j = 0; j < 4; j += 1) {
        statements = optimizeMidIRStatementsForOneRound(
          statements,
          allocator,
          optimizationConfiguration
        );
      }
      return optimizeIRWithTailRecursiveCallTransformation({
        ...midIRFunction,
        mainBodyStatements: statements,
      });
    });
    intermediate = { ...intermediate, functions: newFunctions };
    if (optimizationConfiguration.doesPerformInlining) {
      intermediate = optimizeMidIRCompilationUnitByInlining(intermediate, allocator);
    }
  }

  return intermediate;
};

export default optimizeIRCompilationUnit;
