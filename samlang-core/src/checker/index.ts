import { ModuleReference, Sources } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-toplevel';
import type { ReadonlyGlobalErrorCollector } from '../errors';
import { hashMapOf, mapOf } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';
import {
  buildGlobalTypingContext,
  updateGlobalTypingContext,
} from './global-typing-context-builder';
import ModuleTypeChecker from './module-type-checker';
import type { GlobalTypingContext } from './typing-context';
import checkUndefinedImportsError from './undefined-imports-checker';

const typeCheckModule = (
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  errorCollector: ReadonlyGlobalErrorCollector
): SamlangModule => {
  const moduleErrorCollector = errorCollector.getModuleErrorCollector(moduleReference);
  checkUndefinedImportsError(sources, samlangModule, moduleErrorCollector);
  const moduleContext = globalTypingContext.get(moduleReference);
  assertNotNull(moduleContext);
  const checkedModule = new ModuleTypeChecker(moduleErrorCollector).typeCheck(samlangModule, {
    ...moduleContext.importedClasses,
    ...moduleContext.definedClasses,
  });
  return checkedModule;
};

export const typeCheckSources = (
  sources: Sources<SamlangModule>,
  errorCollector: ReadonlyGlobalErrorCollector
): readonly [Sources<SamlangModule>, GlobalTypingContext] => {
  const globalTypingContext = buildGlobalTypingContext(sources);
  const checkedSources = hashMapOf<ModuleReference, SamlangModule>();
  sources.forEach((samlangModule, moduleReference) => {
    checkedSources.set(
      moduleReference,
      typeCheckModule(sources, globalTypingContext, moduleReference, samlangModule, errorCollector)
    );
  });
  return [checkedSources, globalTypingContext];
};

export const typeCheckSourcesIncrementally = (
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  affectedSourceList: readonly ModuleReference[],
  errorCollector: ReadonlyGlobalErrorCollector
): Sources<SamlangModule> => {
  updateGlobalTypingContext(globalTypingContext, sources, affectedSourceList);
  const updatedSources = hashMapOf<ModuleReference, SamlangModule>();
  affectedSourceList.forEach((moduleReference) => {
    const samlangModule = sources.get(moduleReference);
    if (samlangModule == null) {
      return;
    }
    updatedSources.set(
      moduleReference,
      typeCheckModule(sources, globalTypingContext, moduleReference, samlangModule, errorCollector)
    );
  });
  return updatedSources;
};

// eslint-disable-next-line camelcase
export const typeCheckSingleModuleSource_EXPOSED_FOR_TESTING = (
  samlangModule: SamlangModule,
  errorCollector: ReadonlyGlobalErrorCollector
): SamlangModule => {
  const moduleReference = new ModuleReference(['Test']);
  const checkedModule = typeCheckSources(
    mapOf([moduleReference, samlangModule]),
    errorCollector
  )[0].get(moduleReference);
  assertNotNull(checkedModule);
  return checkedModule;
};

export type { GlobalTypingContext };
