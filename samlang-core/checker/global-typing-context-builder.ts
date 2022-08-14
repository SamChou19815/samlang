/** Responsible for building the global typing environment as part of pre-processing phase. */

import {
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
} from '../ast/samlang-nodes';
import { checkNotNull } from '../utils';
import {
  ClassTypingContext,
  DEFAULT_BUILTIN_TYPING_CONTEXT,
  GlobalTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
} from './typing-context';

function buildInterfaceTypingContext({
  typeParameters,
  members,
  extendsOrImplementsNode,
}: SourceInterfaceDeclaration) {
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
    superTypes: [],
    functions,
    methods,
  };
}

function buildClassTypingContext(
  moduleReference: ModuleReference,
  classDefinition: SourceClassDefinition,
): ClassTypingContext {
  const { typeParameters, functions, methods } = buildInterfaceTypingContext(classDefinition);
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
    superTypes: [],
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
        buildInterfaceTypingContext(declaration),
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

export function buildGlobalTypingContext(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext = DEFAULT_BUILTIN_TYPING_CONTEXT,
): GlobalTypingContext {
  const modules = ModuleReferenceCollections.hashMapOf<ModuleTypingContext>();
  modules.set(ModuleReference.ROOT, builtinModuleTypes);
  sources.forEach((samlangModule, moduleReference) => {
    modules.set(moduleReference, buildModuleTypingContext(moduleReference, samlangModule));
  });
  return modules;
}
