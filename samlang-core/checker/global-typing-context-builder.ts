/** Responsible for building the global typing environment as part of pre-processing phase. */

import { DummySourceReason, ModuleReference, Range, Sources } from '../ast/common-nodes';
import {
  SamlangModule,
  SourceClassDefinition,
  SourceFunctionType,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../ast/samlang-nodes';
import type { DefaultBuiltinClasses } from '../parser';
import { checkNotNull, hashMapOf } from '../utils';
import { normalizeTypeInformation } from './type-substitution';
import type {
  ClassTypingContext,
  GlobalTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
} from './typing-context';

function buildInterfaceTypingContext(
  moduleReference: ModuleReference,
  { typeParameters, members }: SourceInterfaceDeclaration
) {
  const functions: Record<string, MemberTypeInformation> = {};
  const methods: Record<string, MemberTypeInformation> = {};
  members.forEach(({ name, isPublic, isMethod, type, typeParameters: memberTypeParameters }) => {
    const typeInformation = normalizeTypeInformation(moduleReference, {
      isPublic,
      typeParameters: memberTypeParameters.map((it) => it.name),
      type,
    });
    if (isMethod) {
      methods[name.name] = typeInformation;
    } else {
      functions[name.name] = typeInformation;
    }
  });
  return {
    typeParameters: typeParameters.map((it) => it.name),
    functions,
    methods,
  };
}

function buildClassTypingContext(
  moduleReference: ModuleReference,
  classDefinition: SourceClassDefinition
): ClassTypingContext {
  const { typeParameters, functions, methods } = buildInterfaceTypingContext(
    moduleReference,
    classDefinition
  );
  const classType = SourceIdentifierType(
    DummySourceReason,
    moduleReference,
    classDefinition.name.name,
    typeParameters.map((it) => SourceIdentifierType(DummySourceReason, moduleReference, it, []))
  );
  const { typeDefinition } = classDefinition;
  if (typeDefinition.type === 'object') {
    functions.init = normalizeTypeInformation(moduleReference, {
      isPublic: true,
      typeParameters,
      type: SourceFunctionType(
        DummySourceReason,
        typeDefinition.names.map((it) => checkNotNull(typeDefinition.mappings[it.name]).type),
        classType
      ),
    });
  } else {
    Object.entries(typeDefinition.mappings).forEach(([tag, { type }]) => {
      functions[tag] = normalizeTypeInformation(moduleReference, {
        isPublic: true,
        typeParameters,
        type: SourceFunctionType(DummySourceReason, [type], classType),
      });
    });
  }
  return { typeParameters, typeDefinition, functions, methods };
}

function buildModuleTypingContext(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule
): ModuleTypingContext {
  return {
    interfaces: Object.fromEntries(
      samlangModule.interfaces.map((declaration) => [
        declaration.name.name,
        buildInterfaceTypingContext(moduleReference, declaration),
      ])
    ),
    classes: Object.fromEntries(
      samlangModule.classes.map((declaration) => [
        declaration.name.name,
        buildClassTypingContext(moduleReference, declaration),
      ])
    ),
  };
}

export const DEFAULT_BUILTIN_TYPING_CONTEXT: {
  readonly interfaces: Readonly<Record<never, ClassTypingContext>>;
  readonly classes: Readonly<Record<DefaultBuiltinClasses, ClassTypingContext>>;
} = {
  interfaces: {},
  classes: {
    Builtins: {
      typeParameters: [],
      typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
      functions: {
        stringToInt: {
          isPublic: true,
          typeParameters: [],
          type: SourceFunctionType(
            DummySourceReason,
            [SourceStringType(DummySourceReason)],
            SourceIntType(DummySourceReason)
          ),
        },
        intToString: {
          isPublic: true,
          typeParameters: [],
          type: SourceFunctionType(
            DummySourceReason,
            [SourceIntType(DummySourceReason)],
            SourceStringType(DummySourceReason)
          ),
        },
        println: {
          isPublic: true,
          typeParameters: [],
          type: SourceFunctionType(
            DummySourceReason,
            [SourceStringType(DummySourceReason)],
            SourceUnitType(DummySourceReason)
          ),
        },
        panic: {
          isPublic: true,
          typeParameters: ['T'],
          type: SourceFunctionType(
            DummySourceReason,
            [SourceStringType(DummySourceReason)],
            SourceIdentifierType(DummySourceReason, ModuleReference.ROOT, 'T')
          ),
        },
      },
      methods: {},
    },
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
