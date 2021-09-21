import type { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { typeCheckSources, GlobalTypingContext } from 'samlang-core-checker';
// eslint-disable-next-line import/no-internal-modules
import type { ModuleTypingContext } from 'samlang-core-checker/typing-context';
import { CompileTimeError, createGlobalErrorCollector } from 'samlang-core-errors';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import { hashMapOf, filterMap } from 'samlang-core-utils';

export function parseSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
  builtInClasses: ReadonlySet<string>
): readonly (readonly [ModuleReference, SamlangModule])[] {
  const errorCollector = createGlobalErrorCollector();
  return filterMap(sourceHandles, ([moduleReference, sourceString]) => {
    const moduleErrorCollector = errorCollector.getModuleErrorCollector(moduleReference);
    const parsed = parseSamlangModuleFromText(
      sourceString,
      moduleReference,
      builtInClasses,
      moduleErrorCollector
    );
    return moduleErrorCollector.hasErrors ? null : ([moduleReference, parsed] as const);
  });
}

type CheckSourcesResult = {
  readonly checkedSources: Sources<SamlangModule>;
  readonly globalTypingContext: GlobalTypingContext;
  readonly compileTimeErrors: readonly CompileTimeError[];
};

export function checkSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
  builtinModuleTypes: ModuleTypingContext
): CheckSourcesResult {
  const errorCollector = createGlobalErrorCollector();
  const moduleMappings = hashMapOf(
    ...sourceHandles.map(
      ([moduleReference, text]) =>
        [
          moduleReference,
          parseSamlangModuleFromText(
            text,
            moduleReference,
            new Set(Object.keys(builtinModuleTypes)),
            errorCollector.getModuleErrorCollector(moduleReference)
          ),
        ] as const
    )
  );
  const [checkedSources, globalTypingContext] = typeCheckSources(
    moduleMappings,
    builtinModuleTypes,
    errorCollector
  );
  return { checkedSources, globalTypingContext, compileTimeErrors: errorCollector.getErrors() };
}
