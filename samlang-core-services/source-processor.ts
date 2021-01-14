import type { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import type { LLVMModule } from 'samlang-core-ast/llvm-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { typeCheckSources, GlobalTypingContext } from 'samlang-core-checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRModuleToLLVMModule,
} from 'samlang-core-compiler';
import { CompileTimeError, createGlobalErrorCollector } from 'samlang-core-errors';
import { optimizeHighIRFunctions } from 'samlang-core-optimization';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import { hashMapOf, isNotNull } from 'samlang-core-utils';

export const parseSources = (
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): readonly (readonly [ModuleReference, SamlangModule])[] => {
  const errorCollector = createGlobalErrorCollector();
  return sourceHandles
    .map(([moduleReference, sourceString]) => {
      const moduleErrorCollector = errorCollector.getModuleErrorCollector(moduleReference);
      const parsed = parseSamlangModuleFromText(
        sourceString,
        moduleReference,
        moduleErrorCollector
      );
      return moduleErrorCollector.hasErrors ? null : ([moduleReference, parsed] as const);
    })
    .filter(isNotNull);
};

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
          parseSamlangModuleFromText(
            text,
            moduleReference,
            errorCollector.getModuleErrorCollector(moduleReference)
          ),
        ] as const
    )
  );
  const [checkedSources, globalTypingContext] = typeCheckSources(moduleMappings, errorCollector);
  return { checkedSources, globalTypingContext, compileTimeErrors: errorCollector.getErrors() };
};

export const lowerSourcesToLLVMModules = (sources: Sources<SamlangModule>): Sources<LLVMModule> =>
  hashMapOf(
    ...compileSamlangSourcesToHighIRSources(sources)
      .entries()
      .map(
        ([moduleReference, highIRModule]) =>
          [
            moduleReference,
            lowerHighIRModuleToLLVMModule({
              ...highIRModule,
              functions: optimizeHighIRFunctions(highIRModule.functions),
            }),
          ] as const
      )
  );
