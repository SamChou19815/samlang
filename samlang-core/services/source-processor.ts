import type { AssemblyProgram } from 'samlang-core-ast/asm-program';
import type { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { typeCheckSources, GlobalTypingContext } from 'samlang-core-checker';
import {
  compileSamlangSourcesToHighIRSources,
  compileHighIrModuleToMidIRCompilationUnit,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
} from 'samlang-core-compiler';
import { CompileTimeError, createGlobalErrorCollector } from 'samlang-core-errors';
import optimizeIRCompilationUnit from 'samlang-core-optimization';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import { hashMapOf } from 'samlang-core-utils';

type CheckSourcesResult = {
  readonly checkedSources: Sources<SamlangModule>;
  readonly globalTypingContext: GlobalTypingContext;
  readonly compileTimeErrors: readonly CompileTimeError[];
};

export const checkSources = (
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): CheckSourcesResult => {
  const errorCollector = createGlobalErrorCollector();
  const moduleMappings = hashMapOf(
    ...sourceHandles.map(
      ([moduleReference, text]) =>
        [
          moduleReference,
          parseSamlangModuleFromText(text, errorCollector.getModuleErrorCollector(moduleReference)),
        ] as const
    )
  );
  const [checkedSources, globalTypingContext] = typeCheckSources(moduleMappings, errorCollector);
  return { checkedSources, globalTypingContext, compileTimeErrors: errorCollector.getErrors() };
};

export const lowerSourcesToAssemblyPrograms = (
  sources: Sources<SamlangModule>
): Sources<AssemblyProgram> =>
  hashMapOf(
    ...compileSamlangSourcesToHighIRSources(sources)
      .entries()
      .map(
        ([moduleReference, highIRModule]) =>
          [
            moduleReference,
            generateAssemblyInstructionsFromMidIRCompilationUnit(
              optimizeIRCompilationUnit(compileHighIrModuleToMidIRCompilationUnit(highIRModule))
            ),
          ] as const
      )
  );
