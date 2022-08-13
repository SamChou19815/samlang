/** Responsible for building the global typing environment as part of pre-processing phase. */

import {
  BuiltinReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
  SourceReason,
  Sources,
} from '../ast/common-nodes';
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
import { checkNotNull } from '../utils';
import type {
  ClassTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
  UnoptimizedGlobalTypingContext,
} from './typing-context';

function buildInterfaceTypingContext(
  moduleReference: ModuleReference,
  { typeParameters, members, extendsOrImplementsNode }: SourceInterfaceDeclaration,
) {
  const functions = new Map<string, MemberTypeInformation>();
  const methods = new Map<string, MemberTypeInformation>();
  members.forEach(({ name, isPublic, isMethod, type, typeParameters: memberTypeParameters }) => {
    const typeInformation = {
      isPublic,
      typeParameters: memberTypeParameters.map((it) => ({ name: it.name.name, bound: it.bound })),
      type,
    };
    if (isMethod) {
      methods.set(name.name, typeInformation);
    } else {
      functions.set(name.name, typeInformation);
    }
  });
  return {
    typeParameters: typeParameters.map((it) => ({ name: it.name.name, bound: it.bound })),
    extendsOrImplements: extendsOrImplementsNode ?? null,
    functions,
    methods,
  };
}

function buildClassTypingContext(
  moduleReference: ModuleReference,
  classDefinition: SourceClassDefinition,
): ClassTypingContext {
  const { typeParameters, functions, methods } = buildInterfaceTypingContext(
    moduleReference,
    classDefinition,
  );
  const classType = SourceIdentifierType(
    SourceReason(classDefinition.name.location, classDefinition.name.location),
    moduleReference,
    classDefinition.name.name,
    classDefinition.typeParameters.map((it) =>
      SourceIdentifierType(
        SourceReason(it.location, it.location),
        moduleReference,
        it.name.name,
        [],
      ),
    ),
  );
  const { typeDefinition } = classDefinition;
  const typeDefinitionReason = SourceReason(typeDefinition.location, typeDefinition.location);
  if (typeDefinition.type === 'object') {
    functions.set('init', {
      isPublic: true,
      typeParameters,
      type: SourceFunctionType(
        typeDefinitionReason,
        typeDefinition.names.map((it) => checkNotNull(typeDefinition.mappings[it.name]).type),
        classType,
      ),
    });
  } else {
    Object.entries(typeDefinition.mappings).forEach(([tag, { type }]) => {
      functions.set(tag, {
        isPublic: true,
        typeParameters,
        type: SourceFunctionType(typeDefinitionReason, [type], classType),
      });
    });
  }
  return {
    typeParameters,
    typeDefinition,
    extendsOrImplements: classDefinition.extendsOrImplementsNode ?? null,
    functions,
    methods,
  };
}

function buildModuleTypingContext(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
): ModuleTypingContext {
  return {
    interfaces: new Map(
      samlangModule.interfaces.map((declaration) => [
        declaration.name.name,
        buildInterfaceTypingContext(moduleReference, declaration),
      ]),
    ),
    classes: new Map(
      samlangModule.classes.map((declaration) => [
        declaration.name.name,
        buildClassTypingContext(moduleReference, declaration),
      ]),
    ),
  };
}

export const DEFAULT_BUILTIN_TYPING_CONTEXT: {
  readonly interfaces: ReadonlyMap<string, ClassTypingContext>;
  readonly classes: ReadonlyMap<DefaultBuiltinClasses, ClassTypingContext>;
} = {
  interfaces: new Map(),
  classes: new Map([
    [
      'Builtins',
      {
        typeParameters: [],
        typeDefinition: { location: Location.DUMMY, type: 'object', names: [], mappings: {} },
        extendsOrImplements: null,
        functions: new Map([
          [
            'stringToInt',
            {
              isPublic: true,
              typeParameters: [],
              type: SourceFunctionType(
                BuiltinReason,
                [SourceStringType(BuiltinReason)],
                SourceIntType(BuiltinReason),
              ),
            },
          ],
          [
            'intToString',
            {
              isPublic: true,
              typeParameters: [],
              type: SourceFunctionType(
                BuiltinReason,
                [SourceIntType(BuiltinReason)],
                SourceStringType(BuiltinReason),
              ),
            },
          ],
          [
            'println',
            {
              isPublic: true,
              typeParameters: [],
              type: SourceFunctionType(
                BuiltinReason,
                [SourceStringType(BuiltinReason)],
                SourceUnitType(BuiltinReason),
              ),
            },
          ],
          [
            'panic',
            {
              isPublic: true,
              typeParameters: [{ name: 'T', bound: null }],
              type: SourceFunctionType(
                BuiltinReason,
                [SourceStringType(BuiltinReason)],
                SourceIdentifierType(BuiltinReason, ModuleReference.ROOT, 'T'),
              ),
            },
          ],
        ]),
        methods: new Map(),
      },
    ],
  ]),
};

/**
 * Build global typing context from scratch.
 *
 * @param sources a collection of all sources needed for type checking.
 * @returns a fully constructed global typing context.
 */
export function buildGlobalTypingContext(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext,
): UnoptimizedGlobalTypingContext {
  const modules = ModuleReferenceCollections.hashMapOf<ModuleTypingContext>();
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
  globalTypingContext: UnoptimizedGlobalTypingContext,
  sources: Sources<SamlangModule>,
  potentiallyAffectedModuleReferences: readonly ModuleReference[],
): void {
  potentiallyAffectedModuleReferences.forEach((moduleReference) => {
    const samlangModule = sources.get(moduleReference);
    if (samlangModule == null) {
      globalTypingContext.delete(moduleReference);
    } else {
      globalTypingContext.set(
        moduleReference,
        buildModuleTypingContext(moduleReference, samlangModule),
      );
    }
  });
}
