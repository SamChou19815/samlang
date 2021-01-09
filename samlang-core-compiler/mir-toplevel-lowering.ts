import coalesceMoveAndReturnForHighIRStatements from './hir-move-return-coalescing';
import performTailRecursiveCallTransformationOnHighIRFunction from './hir-tail-recursion-transformation-hir';
import createMidIRBasicBlocks from './mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from './mir-basic-block-optimized-emitter';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from './mir-basic-block-reorder';
import midIRTranslateStatementsAndCollectGlobalStrings from './mir-lowering-translator';
import MidIRResourceAllocator from './mir-resource-allocator';

import { HIR_ZERO } from 'samlang-core-ast/hir-expressions';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { MidIRCompilationUnit, MidIRFunction, MIR_RETURN } from 'samlang-core-ast/mir-nodes';
import { optimizeIrWithSimpleOptimization } from 'samlang-core-optimization/simple-optimizations';

const compileHighIrModuleToMidIRCompilationUnit = (
  highIRModule: HighIRModule
): MidIRCompilationUnit => {
  const allocator = new MidIRResourceAllocator();
  const functions: MidIRFunction[] = [];
  highIRModule.functions.forEach((highIRFunction) => {
    const slightlyOptimizedHighIRFUnction = performTailRecursiveCallTransformationOnHighIRFunction({
      ...highIRFunction,
      body: coalesceMoveAndReturnForHighIRStatements(highIRFunction.body) ?? highIRFunction.body,
    });
    const loweredStatements = midIRTranslateStatementsAndCollectGlobalStrings(
      allocator,
      slightlyOptimizedHighIRFUnction.name,
      slightlyOptimizedHighIRFUnction.body
    );
    functions.push({
      functionName: slightlyOptimizedHighIRFUnction.name,
      argumentNames: slightlyOptimizedHighIRFUnction.parameters.map((it) => `_${it}`),
      mainBodyStatements: optimizeIrWithSimpleOptimization(
        emitCanonicalMidIRStatementsFromReorderedBasicBlocks(
          reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath(
            createMidIRBasicBlocks(allocator, slightlyOptimizedHighIRFUnction.name, [
              ...loweredStatements,
              MIR_RETURN(HIR_ZERO),
            ])
          )
        )
      ),
    });
  });
  return { globalVariables: highIRModule.globalVariables, functions };
};

export default compileHighIrModuleToMidIRCompilationUnit;
