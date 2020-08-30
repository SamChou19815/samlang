import type { GlobalVariable } from '../ast/common-nodes';
import type { HighIRModule } from '../ast/hir-toplevel';
import { MidIRCompilationUnit, MidIRFunction, MIR_RETURN } from '../ast/mir-nodes';
import { optimizeIrWithSimpleOptimization } from '../optimization/simple-optimizations';
import createMidIRBasicBlocks from './mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from './mir-basic-block-optimized-emitter';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from './mir-basic-block-reorder';
import midIRTranslateStatementsAndCollectGlobalStrings from './mir-lowering-translator';
import MidIRResourceAllocator from './mir-resource-allocator';

const compileHighIrModuleToMidIRCompilationUnit = (
  highIRModule: HighIRModule
): MidIRCompilationUnit => {
  const allocator = new MidIRResourceAllocator();
  const globalVariables = new Map<string, GlobalVariable>();
  const functions: MidIRFunction[] = [];
  highIRModule.functions.forEach((highIRFunction) => {
    const {
      loweredStatements,
      stringGlobalVariables,
    } = midIRTranslateStatementsAndCollectGlobalStrings(
      allocator,
      highIRFunction.name,
      highIRFunction.body
    );
    stringGlobalVariables.forEach((it) => globalVariables.set(it.name, it));
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
      hasReturn: highIRFunction.hasReturn,
    });
  });
  return { globalVariables: Array.from(globalVariables.values()), functions };
};

export default compileHighIrModuleToMidIRCompilationUnit;
