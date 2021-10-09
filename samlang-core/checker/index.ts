import { ModuleReference, Sources } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-nodes';
import {
  CompileTimeError,
  createGlobalErrorCollector,
  ReadonlyGlobalErrorCollector,
} from '../errors';
import { parseSamlangModuleFromText } from '../parser';
import { HashMap, HashSet, ReadonlyHashSet, hashMapOf, mapOf, setOf, hashSetOf } from '../utils';
import {
  DEFAULT_BUILTIN_TYPING_CONTEXT,
  buildGlobalTypingContext,
  updateGlobalTypingContext,
} from './global-typing-context-builder';
import {
  collectModuleReferenceFromType,
  collectModuleReferenceFromExpression,
} from './module-references-collector';
import ModuleTypeChecker from './module-type-checker';
import type {
  GlobalTypingContext,
  ModuleTypingContext,
  MemberTypeInformation,
} from './typing-context';
import checkUndefinedImportsError from './undefined-imports-checker';

export { DEFAULT_BUILTIN_TYPING_CONTEXT };

export function collectModuleReferenceFromSamlangModule(
  samlangModule: SamlangModule
): HashSet<ModuleReference> {
  const collector = hashSetOf<ModuleReference>();
  samlangModule.imports.forEach((it) => collector.add(it.importedModule));
  samlangModule.classes.forEach((samlangClass) => {
    Object.values(samlangClass.typeDefinition.mappings).forEach((it) =>
      collectModuleReferenceFromType(it.type, collector)
    );
    samlangClass.members.forEach((member) => {
      collectModuleReferenceFromType(member.type, collector);
      collectModuleReferenceFromExpression(member.body, collector);
    });
  });
  return collector;
}

/**
 * A centralized place to manage up-to-date dependency relationship.
 * It is particularly useful for incremental type checking.
 */
export class DependencyTracker {
  /** [module] => what this module depends on */
  private readonly forwardDependency: HashMap<ModuleReference, ReadonlyHashSet<ModuleReference>> =
    hashMapOf();

  /** [module] => other modules depends on this module */
  private readonly reverseDependency: HashMap<ModuleReference, HashSet<ModuleReference>> =
    hashMapOf();

  getForwardDependencies(moduleReference: ModuleReference): ReadonlyHashSet<ModuleReference> {
    return this.forwardDependency.get(moduleReference) ?? setOf();
  }

  getReverseDependencies(moduleReference: ModuleReference): ReadonlyHashSet<ModuleReference> {
    return this.reverseDependency.get(moduleReference) ?? setOf();
  }

  /**
   * Update dependency tracker with `moduleReference` and `usedModules`.
   * If `usedModules` is null, it means that we want to remove `moduleReference` from system.
   */
  update(moduleReference: ModuleReference, usedModules?: readonly ModuleReference[]): void {
    const oldUsedModules = this.forwardDependency.get(moduleReference);
    if (oldUsedModules != null) {
      oldUsedModules.forEach((oldUsedModule) => {
        const reverseDependencySet = this.reverseDependency.forceGet(oldUsedModule);
        // If things are consistent:
        //   then if B is A's forward dependency, then A must be B's reverse dependency.
        reverseDependencySet.delete(moduleReference);
      });
    }
    if (usedModules == null) {
      this.forwardDependency.delete(moduleReference);
      return;
    }
    this.forwardDependency.set(moduleReference, setOf(...usedModules));
    usedModules.forEach((newUsedModule) => {
      const reverseDependencies = this.reverseDependency.get(newUsedModule);
      if (reverseDependencies == null) {
        this.reverseDependency.set(newUsedModule, hashSetOf(moduleReference));
      } else {
        reverseDependencies?.add(moduleReference);
      }
    });
  }
}

function typeCheckModule(
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  errorCollector: ReadonlyGlobalErrorCollector
): SamlangModule {
  const moduleErrorCollector = errorCollector.getModuleErrorCollector(moduleReference);
  checkUndefinedImportsError(sources, samlangModule, moduleErrorCollector);
  const checkedModule = new ModuleTypeChecker(moduleReference, moduleErrorCollector).typeCheck(
    samlangModule,
    globalTypingContext
  );
  return checkedModule;
}

export function typeCheckSources(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext,
  errorCollector: ReadonlyGlobalErrorCollector
): readonly [Sources<SamlangModule>, GlobalTypingContext] {
  const globalTypingContext = buildGlobalTypingContext(sources, builtinModuleTypes);
  const checkedSources = hashMapOf<ModuleReference, SamlangModule>();
  sources.forEach((samlangModule, moduleReference) => {
    checkedSources.set(
      moduleReference,
      typeCheckModule(sources, globalTypingContext, moduleReference, samlangModule, errorCollector)
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
  builtinModuleTypes: ModuleTypingContext
): TypeCheckSourceHandlesResult {
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

export function typeCheckSourcesIncrementally(
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  affectedSourceList: readonly ModuleReference[],
  errorCollector: ReadonlyGlobalErrorCollector
): Sources<SamlangModule> {
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
}

export function typeCheckSingleModuleSource(
  samlangModule: SamlangModule,
  builtinModuleTypes: ModuleTypingContext,
  errorCollector: ReadonlyGlobalErrorCollector
): SamlangModule {
  const moduleReference = new ModuleReference(['Test']);
  const checkedModule = typeCheckSources(
    mapOf([moduleReference, samlangModule]),
    builtinModuleTypes,
    errorCollector
  )[0].forceGet(moduleReference);
  return checkedModule;
}

export type { GlobalTypingContext, MemberTypeInformation };
