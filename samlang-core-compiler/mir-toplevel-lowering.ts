import createMidIRBasicBlocks from './mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from './mir-basic-block-optimized-emitter';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from './mir-basic-block-reorder';
import midIRTranslateStatementsAndCollectGlobalStrings from './mir-lowering-translator';
import MidIRResourceAllocator from './mir-resource-allocator';

import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { MidIRCompilationUnit, MidIRFunction, MIR_RETURN } from 'samlang-core-ast/mir-nodes';
import { optimizeIrWithSimpleOptimization } from 'samlang-core-optimization/simple-optimizations';

const compileHighIrModuleToMidIRCompilationUnit = (
  highIRModule: HighIRModule
): MidIRCompilationUnit => {
  const allocator = new MidIRResourceAllocator();
  const functions: MidIRFunction[] = [];
  highIRModule.functions.forEach((highIRFunction) => {
    const loweredStatements = midIRTranslateStatementsAndCollectGlobalStrings(
      allocator,
      highIRFunction.name,
      highIRFunction.body
    );
    functions.push({
      functionName: highIRFunction.name,
      argumentNames: highIRFunction.parameters.map((it) => `_${it}`),
      mainBodyStatements: optimizeIrWithSimpleOptimization(
        emitCanonicalMidIRStatementsFromReorderedBasicBlocks(
          reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath(
            createMidIRBasicBlocks(allocator, highIRFunction.name, [
              ...loweredStatements,
              MIR_RETURN(),
            ])
          )
        )
      ),
    });
  });
  return { globalVariables: highIRModule.globalVariables, functions };
};

export default compileHighIrModuleToMidIRCompilationUnit;
