import type { AssemblyProgram } from '../ast/asm/asm-program';
import type ModuleReference from '../ast/common/module-reference';
import type { Sources } from '../ast/common/structs';
import type { SamlangModule } from '../ast/lang/samlang-toplevel';
import { typeCheckSources, GlobalTypingContext } from '../checker';
import {
  compileSamlangSourcesToHighIRSources,
  compileHighIrSourcesToMidIRCompilationUnits,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
} from '../compiler';
import { CompileTimeError, createGlobalErrorCollector } from '../errors';
import optimizeIRCompilationUnit from '../optimization';
import { parseSamlangModuleFromText } from '../parser';
import { hashMapOf, HashMap } from '../util/collections';
import { HighIRModule, HighIRFunction } from '../ast/hir/hir-toplevel';

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
    ...compileHighIrSourcesToMidIRCompilationUnits(compileSamlangSourcesToHighIRSources(sources))
      .entries()
      .map(
        ([moduleReference, unoptimizedCompilationUnit]) =>
          [
            moduleReference,
            generateAssemblyInstructionsFromMidIRCompilationUnit(
              optimizeIRCompilationUnit(unoptimizedCompilationUnit)
            ),
          ] as const
      )
  );

export const highIRSourcesToJSString = (sources: Sources<HighIRModule>): Sources<String> => {
  const jsSources: HashMap<ModuleReference, String> = hashMapOf();
  sources.forEach((hirModule, reference) => {
    jsSources.set(
      reference,
      JSON.stringify(
        hirModule.functions.map((highIRFunction: HighIRFunction) => {
          return JSON.stringify(highIRFunction);
        })
      )
    );
  });
  return jsSources;
};
