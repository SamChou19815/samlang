import type { AssemblyProgram } from '../ast/asm-program';
import type { ModuleReference, Sources } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-toplevel';
import { typeCheckSources, GlobalTypingContext } from '../checker';
import {
  compileSamlangSourcesToHighIRSources,
  compileHighIrModuleToMidIRCompilationUnit,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
} from '../compiler';
import { CompileTimeError, createGlobalErrorCollector } from '../errors';
import optimizeIRCompilationUnit from '../optimization';
import { parseSamlangModuleFromText } from '../parser';

import { hashMapOf } from 'samlang-core-utils/collections';

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
