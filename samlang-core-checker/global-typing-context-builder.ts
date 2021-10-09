/** Responsible for building the global typing environment as part of pre-processing phase. */

import {
  ModuleReference,
  Range,
  Sources,
  unitType,
  intType,
  stringType,
  identifierType,
  functionType,
} from 'samlang-core/ast/common-nodes';
import type { SourceClassDefinition, SamlangModule } from 'samlang-core/ast/samlang-nodes';
import { hashMapOf } from 'samlang-core/utils';

import type {
  MemberTypeInformation,
  ClassTypingContext,
  ModuleTypingContext,
  GlobalTypingContext,
} from './typing-context';

function buildClassTypingContext({
  typeParameters,
  typeDefinition,
  members,
}: SourceClassDefinition): ClassTypingContext {
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
}

function buildModuleTypingContext(samlangModule: SamlangModule): ModuleTypingContext {
  return Object.fromEntries(
    samlangModule.classes.map(
      (classDeclaration) =>
        [classDeclaration.name, buildClassTypingContext(classDeclaration)] as const
    )
  );
}

export const DEFAULT_BUILTIN_TYPING_CONTEXT: ModuleTypingContext = {
  Builtins: {
    typeParameters: [],
    typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
    functions: {
      stringToInt: {
        isPublic: true,
        typeParameters: [],
        type: functionType([stringType], intType),
      },
      intToString: {
        isPublic: true,
        typeParameters: [],
        type: functionType([intType], stringType),
      },
      println: {
        isPublic: true,
        typeParameters: [],
        type: functionType([stringType], unitType),
      },
      panic: {
        isPublic: true,
        typeParameters: ['T'],
        type: functionType([stringType], identifierType(ModuleReference.ROOT, 'T')),
      },
    },
    methods: {},
  },
};

/**
 * Build global typing context from scratch.
 *
 * @param sources a collection of all sources needed for type checking.
 * @returns a fully constructed global typing context.
 */
export function buildGlobalTypingContext(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext
): GlobalTypingContext {
  const modules = hashMapOf<ModuleReference, ModuleTypingContext>();
  modules.set(ModuleReference.ROOT, builtinModuleTypes);
  sources.forEach((samlangModule, moduleReference) => {
    modules.set(moduleReference, buildModuleTypingContext(samlangModule));
  });
  return modules;
}

/**
 * Imperatively patch a global typing context with incremental update.
 *
 * @param globalTypingContext existing context to be updated.
 * @param sources a collection of all sources needed for type checking.
 * @param potentiallyAffectedModuleReferences a list of modules that might be affected by a change.
 * (It can be a conservative estimate. You can send more, but not less.)
 */
export function updateGlobalTypingContext(
  globalTypingContext: GlobalTypingContext,
  sources: Sources<SamlangModule>,
  potentiallyAffectedModuleReferences: readonly ModuleReference[]
): void {
  potentiallyAffectedModuleReferences.forEach((moduleReference) => {
    const samlangModule = sources.get(moduleReference);
    if (samlangModule == null) {
      globalTypingContext.delete(moduleReference);
    } else {
      globalTypingContext.set(moduleReference, buildModuleTypingContext(samlangModule));
    }
  });
}
