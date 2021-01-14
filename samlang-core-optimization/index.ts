import optimizeIRWithCommonSubExpressionElimination from './common-subexpression-elimination-optimization';
import optimizeIRWithDeadCodeElimination from './dead-code-elimination-optimization';
import optimizeHighIRStatementsByCommonSubExpressionElimination from './hir-common-subexpression-elimination-optimization';
import optimizeHighIRStatementsByConditionalConstantPropagation from './hir-conditional-constant-propagation-optimization';
import optimizeHighIRStatementsByDeadCodeElimination from './hir-dead-code-elimination-optimization';
import optimizeHighIRFunctionsByInlining from './hir-inline-optimization';
import optimizeHighIRStatementsByLocalValueNumbering from './hir-local-value-numbering-optimization';
import optimizeMidIRCompilationUnitByInlining from './inline-optimization';
import optimizeIRWithLocalValueNumbering from './local-value-numbering-optimization';
import OptimizationResourceAllocator from './optimization-resource-allocator';
import optimizeIrWithSimpleOptimization from './simple-optimizations';

import analyzeUsedFunctionNames from 'samlang-core-analysis/used-name-analysis';
import type { HighIRStatement } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import type { MidIRStatement, MidIRCompilationUnit } from 'samlang-core-ast/mir-nodes';

type OptimizationConfiguration = {
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

const optimizeMidIRStatementsForOneRound = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator,
  {
    doesPerformLocalValueNumbering,
    doesPerformCommonSubExpressionElimination,
  }: OptimizationConfiguration
): readonly MidIRStatement[] => {
  let optimized = statements;
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

export const optimizeHighIRFunctions = (
  functions: readonly HighIRFunction[],
  optimizationConfiguration: OptimizationConfiguration = allEnabledOptimizationConfiguration
): readonly HighIRFunction[] => {
  const allocator = new OptimizationResourceAllocator();

  let intermediate = functions;
  for (let i = 0; i < 4; i += 1) {
    intermediate = intermediate.map((highIRFunction) => {
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
    });
    // istanbul ignore next
    if (optimizationConfiguration.doesPerformInlining) {
      intermediate = optimizeHighIRFunctionsByInlining(intermediate, allocator);
    }
    const usedNames = analyzeUsedFunctionNames(intermediate);
    intermediate = intermediate.filter((it) => usedNames.has(it.name));
  }

  return intermediate;
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
      return { ...midIRFunction, mainBodyStatements: statements };
    });
    intermediate = { ...intermediate, functions: newFunctions };
    if (optimizationConfiguration.doesPerformInlining) {
      intermediate = optimizeMidIRCompilationUnitByInlining(intermediate, allocator);
    }
  }

  return intermediate;
};

export default optimizeIRCompilationUnit;
