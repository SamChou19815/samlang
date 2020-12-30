/** Responsible for building the global typing environment as part of pre-processing phase. */

import type {
  MemberTypeInformation,
  ClassTypingContext,
  ModuleTypingContext,
  GlobalTypingContext,
} from './typing-context';

import type { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import type { ClassDefinition, SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { hashMapOf } from 'samlang-core-utils';

const buildClassTypingContext = ({
  typeParameters,
  typeDefinition,
  members,
}: ClassDefinition): ClassTypingContext => {
  const functions: Record<string, MemberTypeInformation> = {};
  const methods: Record<string, MemberTypeInformation> = {};
  members.forEach(({ name, isPublic, isMethod, type, typeParameters: memberTypeParameters }) => {
    const typeInformation = { isPublic, typeParameters: memberTypeParameters, type };
    if (isMethod) {
      methods[name] = typeInformation;
    } else {
      functions[name] = typeInformation;
    }
  });
  return { typeParameters, typeDefinition, functions, methods };
};

const buildModuleTypingContext = (samlangModule: SamlangModule): ModuleTypingContext =>
  Object.fromEntries(
    samlangModule.classes.map(
      (classDeclaration) =>
        [classDeclaration.name, buildClassTypingContext(classDeclaration)] as const
    )
  );

/**
 * Build global typing context from scratch.
 *
 * @param sources a collection of all sources needed for type checking.
 * @returns a fully constructed global typing context.
 */
export const buildGlobalTypingContext = (sources: Sources<SamlangModule>): GlobalTypingContext => {
  const modules = hashMapOf<ModuleReference, ModuleTypingContext>();
  sources.forEach((samlangModule, moduleReference) => {
    modules.set(moduleReference, buildModuleTypingContext(samlangModule));
  });
  return modules;
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
      globalTypingContext.set(moduleReference, buildModuleTypingContext(samlangModule));
    }
  });
};
