import type ModuleReference from '../../ast/common/module-reference';
import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  encodeMainFunctionName,
} from '../../ast/common/name-encoder';
import type { Sources, GlobalVariable } from '../../ast/common/structs';
import type { HighIRModule } from '../../ast/hir/hir-toplevel';
import { MidIRCompilationUnit, MidIRFunction, MIR_CALL_FUNCTION, MIR_RETURN } from '../../ast/mir';
import {
  optimizeIrWithSimpleOptimization,
  optimizeIRWithUnusedNameElimination,
} from '../../optimization/simple-optimizations';
import optimizeIRWithTailRecursiveCallTransformation from '../../optimization/tail-recursion-optimization';
import { hashMapOf } from '../../util/collections';
import createMidIRBasicBlocks from './mir-basic-block';
import emitCanonicalMidIRStatementsFromReorderedBasicBlocks from './mir-basic-block-optimized-emitter';
import reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath from './mir-basic-block-reorder';
import midIRTranslateStatementsAndCollectGlobalStrings from './mir-lowering-translator';
import MidIRResourceAllocator from './mir-resource-allocator';

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
                createMidIRBasicBlocks(allocator, highIRFunction.name, [
                  ...loweredStatements,
                  MIR_RETURN(),
                ])
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

const getMidIRMainFunction = (entryModuleReference: ModuleReference): MidIRFunction => ({
  functionName: ENCODED_COMPILED_PROGRAM_MAIN,
  argumentNames: [],
  hasReturn: false,
  mainBodyStatements: [
    MIR_CALL_FUNCTION(encodeMainFunctionName(entryModuleReference), []),
    MIR_RETURN(),
  ],
});

export const compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries = (
  sources: Sources<HighIRModule>
): Sources<MidIRCompilationUnit> => {
  const compilationUnitWithoutMain = compileHighIrSourcesToMidIRCompilationUnit(sources);
  const midIRCompilationUnitSources = hashMapOf<ModuleReference, MidIRCompilationUnit>();
  sources.forEach((_, moduleReference) => {
    midIRCompilationUnitSources.set(
      moduleReference,
      optimizeIRWithUnusedNameElimination({
        ...compilationUnitWithoutMain,
        functions: [...compilationUnitWithoutMain.functions, getMidIRMainFunction(moduleReference)],
      })
    );
  });
  return midIRCompilationUnitSources;
};

export const compileHighIrSourcesToMidIRCompilationUnitWithSingleEntry = (
  sources: Sources<HighIRModule>,
  entryModuleReference: ModuleReference
): MidIRCompilationUnit => {
  const compilationUnitWithoutMain = compileHighIrSourcesToMidIRCompilationUnit(sources);
  return optimizeIRWithUnusedNameElimination({
    ...compilationUnitWithoutMain,
    functions: [
      ...compilationUnitWithoutMain.functions,
      getMidIRMainFunction(entryModuleReference),
    ],
  });
};
