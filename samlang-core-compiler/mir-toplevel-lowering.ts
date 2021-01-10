import coalesceMoveAndReturnForHighIRStatements from './hir-move-return-coalescing';
import recursivelyPerformTailRecursiveCallTransformationOnStatements from './hir-tail-recursion-transformation-hir';
import createMidIRBasicBlocks from './mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from './mir-basic-block-optimized-emitter';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from './mir-basic-block-reorder';
import midIRTranslateStatementsAndCollectGlobalStrings from './mir-lowering-translator';
import MidIRResourceAllocator from './mir-resource-allocator';

import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import {
  MidIRCompilationUnit,
  MidIRFunction,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  MIR_ZERO,
} from 'samlang-core-ast/mir-nodes';
import { optimizeIrWithSimpleOptimization } from 'samlang-core-optimization/simple-optimizations';

const compileHighIrModuleToMidIRCompilationUnit = (
  highIRModule: HighIRModule
): MidIRCompilationUnit => {
  const allocator = new MidIRResourceAllocator();
  const functions: MidIRFunction[] = [];
  highIRModule.functions.forEach((highIRFunction) => {
    const slightlyOptimizedBody =
      coalesceMoveAndReturnForHighIRStatements(highIRFunction.body) ?? highIRFunction.body;
    const tailRecursionRewrittenStatements = recursivelyPerformTailRecursiveCallTransformationOnStatements(
      highIRFunction,
      slightlyOptimizedBody
    );
    const loweredStatements = midIRTranslateStatementsAndCollectGlobalStrings(
      allocator,
      highIRFunction.name,
      tailRecursionRewrittenStatements ?? slightlyOptimizedBody
    );
    let finalStatements: typeof loweredStatements;
    if (tailRecursionRewrittenStatements == null) {
      finalStatements = [...loweredStatements, MIR_RETURN(MIR_ZERO)];
    } else {
      const whileTrueStartLabel = allocator.allocateLabelWithAnnotation(
        highIRFunction.name,
        'WHILE_TRUE_START'
      );
      finalStatements = [
        MIR_LABEL(whileTrueStartLabel),
        ...loweredStatements,
        MIR_JUMP(whileTrueStartLabel),
        MIR_RETURN(MIR_ZERO),
      ];
    }
    functions.push({
      functionName: highIRFunction.name,
      argumentNames: highIRFunction.parameters.map((it) => `_${it}`),
      mainBodyStatements: optimizeIrWithSimpleOptimization(
        emitCanonicalMidIRStatementsFromReorderedBasicBlocks(
          reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath(
            createMidIRBasicBlocks(allocator, highIRFunction.name, finalStatements)
          )
        )
      ),
    });
  });
  return { globalVariables: highIRModule.globalVariables, functions };
};

export default compileHighIrModuleToMidIRCompilationUnit;
