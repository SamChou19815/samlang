import { ModuleReference, ModuleReferenceCollections, Sources } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-nodes';
import {
  CompileTimeError,
  createGlobalErrorCollector,
  ReadonlyGlobalErrorCollector,
} from '../errors';
import { parseSamlangModuleFromText } from '../parser';
import { buildGlobalTypingContext } from './global-typing-context-builder';
import typeCheckSamlangModule from './module-type-checker';
import type { GlobalTypingContext, MemberTypeInformation } from './typing-context';
import checkUndefinedImportsError from './undefined-imports-checker';

export type { GlobalTypingContext as GlobalTypingContext, MemberTypeInformation };

function typeCheckModule(
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  errorCollector: ReadonlyGlobalErrorCollector,
): SamlangModule {
  const errorReporter = errorCollector.getErrorReporter();
  checkUndefinedImportsError(sources, samlangModule, errorReporter);
  const checkedModule = typeCheckSamlangModule(
    moduleReference,
    samlangModule,
    globalTypingContext,
    errorReporter,
  );
  return checkedModule;
}

export function typeCheckSources(
  sources: Sources<SamlangModule>,
  errorCollector: ReadonlyGlobalErrorCollector,
): readonly [Sources<SamlangModule>, GlobalTypingContext] {
  const globalTypingContext = buildGlobalTypingContext(sources, errorCollector.getErrorReporter());
  const checkedSources = ModuleReferenceCollections.hashMapOf<SamlangModule>();
  sources.forEach((samlangModule, moduleReference) => {
    checkedSources.set(
      moduleReference,
      typeCheckModule(sources, globalTypingContext, moduleReference, samlangModule, errorCollector),
    );
  });
  return [checkedSources, globalTypingContext];
}

type TypeCheckSourceHandlesResult = {
  readonly checkedSources: Sources<SamlangModule>;
  readonly globalTypingContext: GlobalTypingContext;
  readonly compileTimeErrors: readonly CompileTimeError[];
};

export function typeCheckSourceHandles(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
): TypeCheckSourceHandlesResult {
  const errorCollector = createGlobalErrorCollector();
  const parsedSources = ModuleReferenceCollections.hashMapOf(
    ...sourceHandles.map(
      ([moduleReference, text]) =>
        [
          moduleReference,
          parseSamlangModuleFromText(text, moduleReference, errorCollector.getErrorReporter()),
        ] as const,
    ),
  );
  const [checkedSources, globalTypingContext] = typeCheckSources(parsedSources, errorCollector);
  return { checkedSources, globalTypingContext, compileTimeErrors: errorCollector.getErrors() };
}

export function typeCheckSingleModuleSource(
  samlangModule: SamlangModule,
  errorCollector: ReadonlyGlobalErrorCollector,
): SamlangModule {
  const moduleReference = ModuleReference(['Test']);
  const checkedModule = typeCheckSources(
    ModuleReferenceCollections.mapOf([moduleReference, samlangModule]),
    errorCollector,
  )[0].forceGet(moduleReference);
  return checkedModule;
}
