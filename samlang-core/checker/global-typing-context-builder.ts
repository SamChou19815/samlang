/** Responsible for building the global typing environment as part of pre-processing phase. */

import { ModuleReference, Range, Sources } from '../ast/common-nodes';
import {
  SamlangModule,
  SourceClassDefinition,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../ast/samlang-nodes';
import type { DefaultBuiltinClasses } from '../parser';
import { checkNotNull, hashMapOf } from '../utils';
import type {
  ClassTypingContext,
  GlobalTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
} from './typing-context';

function buildClassTypingContext(
  moduleReference: ModuleReference,
  { name: className, typeParameters, typeDefinition, members }: SourceClassDefinition
): ClassTypingContext {
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
  const classType = SourceIdentifierType(
    moduleReference,
    className,
    typeParameters.map((it) => SourceIdentifierType(moduleReference, it, []))
  );
  if (typeDefinition.type === 'object') {
    functions.init = {
      isPublic: true,
      typeParameters,
      type: SourceFunctionType(
        typeDefinition.names.map((it) => checkNotNull(typeDefinition.mappings[it]).type),
        classType
      ),
    };
  } else {
    Object.entries(typeDefinition.mappings).forEach(([tag, { type }]) => {
      functions[tag] = {
        isPublic: true,
        typeParameters,
        type: SourceFunctionType([type], classType),
      };
    });
  }
  return { typeParameters, typeDefinition, functions, methods };
}

function buildModuleTypingContext(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule
): ModuleTypingContext {
  return Object.fromEntries(
    samlangModule.classes.map(
      (classDeclaration) =>
        [classDeclaration.name, buildClassTypingContext(moduleReference, classDeclaration)] as const
    )
  );
}

export const DEFAULT_BUILTIN_TYPING_CONTEXT: Readonly<
  Record<DefaultBuiltinClasses, ClassTypingContext>
> = {
  Builtins: {
    typeParameters: [],
    typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
    functions: {
      stringToInt: {
        isPublic: true,
        typeParameters: [],
        type: SourceFunctionType([SourceStringType], SourceIntType),
      },
      intToString: {
        isPublic: true,
        typeParameters: [],
        type: SourceFunctionType([SourceIntType], SourceStringType),
      },
      println: {
        isPublic: true,
        typeParameters: [],
        type: SourceFunctionType([SourceStringType], SourceUnitType),
      },
      panic: {
        isPublic: true,
        typeParameters: ['T'],
        type: SourceFunctionType(
          [SourceStringType],
          SourceIdentifierType(ModuleReference.ROOT, 'T')
        ),
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
    modules.set(moduleReference, buildModuleTypingContext(moduleReference, samlangModule));
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
      globalTypingContext.set(
        moduleReference,
        buildModuleTypingContext(moduleReference, samlangModule)
      );
    }
  });
}
