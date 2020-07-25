import type { Sources, GlobalVariable } from '../../ast/common/structs';
import type { HighIRModule } from '../../ast/hir/hir-toplevel';
import type { MidIRCompilationUnit, MidIRFunction } from '../../ast/mir';
import { optimizeIrWithSimpleOptimization } from '../../optimization/simple-optimizations';
import optimizeIRWithTailRecursiveCallTransformation from '../../optimization/tail-recursion-optimization';
import createMidIRBasicBlocks from './mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from './mir-basic-block-optimized-emitter';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from './mir-basic-block-reorder';
import midIRTranslateStatementsAndCollectGlobalStrings from './mir-lowering-translator';
import MidIRResourceAllocator from './mir-resource-allocator';

// eslint-disable-next-line import/prefer-default-export
export const compileHighIrSourcesToMidIRCompilationUnit = (
  sources: Sources<HighIRModule>
): MidIRCompilationUnit => {
  const allocator = new MidIRResourceAllocator();
  const globalVariables = new Map<string, GlobalVariable>();
  const functions: MidIRFunction[] = [];
  sources.forEach(({ functions: highIRFunctions }) =>
    highIRFunctions.forEach((highIRFunction) => {
      const {
        loweredStatements,
        stringGlobalVariables,
      } = midIRTranslateStatementsAndCollectGlobalStrings(
        allocator,
        highIRFunction.name,
        highIRFunction.body
      );
      stringGlobalVariables.forEach((it) => globalVariables.set(it.name, it));
      functions.push(
        optimizeIRWithTailRecursiveCallTransformation({
          functionName: highIRFunction.name,
          argumentNames: highIRFunction.parameters.map((it) => `_${it}`),
          mainBodyStatements: optimizeIrWithSimpleOptimization(
            emitCanonicalMidIRStatementsFromReorderedBasicBlocks(
              reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath(
                createMidIRBasicBlocks(allocator, highIRFunction.name, loweredStatements)
              )
            )
          ),
          hasReturn: highIRFunction.hasReturn,
        })
      );
    })
  );
  return { globalVariables: Array.from(globalVariables.values()), functions };
};
