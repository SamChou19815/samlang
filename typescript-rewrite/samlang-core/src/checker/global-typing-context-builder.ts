/** Responsible for building the global typing environment as part of pre-processing phase. */

import type ModuleReference from '../ast/common/module-reference';
import type { Sources } from '../ast/common/structs';
import type { ClassInterface, SamlangModule } from '../ast/lang/samlang-toplevel';
import { hashMapOf } from '../util/collections';
import { isNotNull, assertNotNull } from '../util/type-assertions';
import type {
  MemberTypeInformation,
  ClassTypingContext,
  ModuleTypingContext,
  GlobalTypingContext,
  ReadonlyGlobalTypingContext,
} from './typing-context';

const buildClassTypingContext = ({
  typeDefinition,
  members,
}: ClassInterface): ClassTypingContext => {
  const functions: Record<string, MemberTypeInformation> = {};
  const methods: Record<string, MemberTypeInformation> = {};
  members.forEach(({ name, isPublic, isMethod, type, typeParameters }) => {
    const typeInformation = { isPublic, typeParameters, type };
    if (isMethod) {
      methods[name] = typeInformation;
    } else {
      functions[name] = typeInformation;
    }
  });

  return { typeDefinition, functions, methods };
};

/**
 * @returns module's typing context built from reading class definitions.
 * Imports are ignored in this phase since they will be patched back in phase 2.
 */
const buildModuleTypingContextPhase1 = (samlangModule: SamlangModule): ModuleTypingContext => ({
  definedClasses: Object.fromEntries(
    samlangModule.classes
      .map((classDeclaration) => {
        if (!classDeclaration.isPublic) {
          return null;
        }
        return [classDeclaration.name, buildClassTypingContext(classDeclaration)] as const;
      })
      .filter(isNotNull)
  ),
  importedClasses: {},
});

/**
 * @returns module's typing context built from merging existing class definitions with imported ones.
 * Existing ones are built in phase 1.
 */
const buildModuleTypingContextPhase2 = (
  modules: ReadonlyGlobalTypingContext,
  moduleTypingContext: ModuleTypingContext,
  samlangModule: SamlangModule
): ModuleTypingContext => ({
  definedClasses: moduleTypingContext.definedClasses,
  importedClasses: Object.fromEntries(
    samlangModule.imports
      .map((oneImport) => {
        const importedModuleContext = modules.get(oneImport.importedModule);
        return importedModuleContext == null
          ? null
          : oneImport.importedMembers
              .map(([className]) => {
                const definedClassImported = importedModuleContext.definedClasses[className];
                if (definedClassImported == null) {
                  return null;
                }
                return [className, definedClassImported] as const;
              })
              .filter(isNotNull);
      })
      .filter(isNotNull)
      .flat()
  ),
});

/**
 * Build global typing context from scratch.
 *
 * @param sources a collection of all sources needed for type checking.
 * @returns a fully constructed global typing context.
 */
export const buildGlobalTypingContext = (sources: Sources<SamlangModule>): GlobalTypingContext => {
  const phase1Modules = hashMapOf<ModuleReference, ModuleTypingContext>();
  sources.forEach((samlangModule, moduleReference) => {
    phase1Modules.set(moduleReference, buildModuleTypingContextPhase1(samlangModule));
  });
  const phase2Modules = hashMapOf<ModuleReference, ModuleTypingContext>();
  sources.forEach((samlangModule, moduleReference) => {
    const context = phase1Modules.get(moduleReference);
    assertNotNull(context);
    phase2Modules.set(
      moduleReference,
      buildModuleTypingContextPhase2(phase1Modules, context, samlangModule)
    );
  });
  return phase2Modules;
};

/**
 * Imperatively patch a global typing context with incremental update.
 *
 * @param globalTypingContext existing context to be updated.
 * @param sources a collection of all sources needed for type checking.
 * @param potentiallyAffectedModuleReferences a list of modules that might be affected by a change.
 * (It can be a conservative estimate. You can send more, but not less.)
 */
export const updateGlobalTypingContext = (
  globalTypingContext: GlobalTypingContext,
  sources: Sources<SamlangModule>,
  potentiallyAffectedModuleReferences: readonly ModuleReference[]
): void => {
  // Phase 1: Build defined classes
  potentiallyAffectedModuleReferences.forEach((moduleReference) => {
    const samlangModule = sources.get(moduleReference);
    if (samlangModule == null) {
      globalTypingContext.delete(moduleReference);
    } else {
      globalTypingContext.set(moduleReference, buildModuleTypingContextPhase1(samlangModule));
    }
  });
  // Phase 2: Build imported classes
  potentiallyAffectedModuleReferences.forEach((moduleReference) => {
    const samlangModule = sources.get(moduleReference);
    if (samlangModule == null) {
      return;
    }
    const context = globalTypingContext.get(moduleReference);
    assertNotNull(context);
    globalTypingContext.set(
      moduleReference,
      buildModuleTypingContextPhase2(globalTypingContext, context, samlangModule)
    );
  });
};
