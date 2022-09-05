/** Responsible for building the global typing environment as part of pre-processing phase. */

import {
  ModuleReference,
  ModuleReferenceCollections,
  SourceReason,
  Sources,
} from '../ast/common-nodes';
import {
  isTheSameType,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangModule,
  SourceClassDefinition,
  SourceClassMemberDeclaration,
  SourceFunctionType,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
  TypeParameterSignature,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { checkNotNull, HashMap, ReadonlyHashMap, zip } from '../utils';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from './builtins';
import performTypeSubstitution from './type-substitution';
import type {
  GlobalTypingContext,
  InterfaceTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
  TypeDefinitionTypingContext,
} from './typing-context';

interface UnoptimizedInterfaceTypingContext {
  readonly functions: ReadonlyMap<string, MemberTypeInformation>;
  readonly methods: ReadonlyMap<string, MemberTypeInformation>;
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly extendsOrImplements: readonly SamlangIdentifierType[];
}

interface UnoptimizedModuleTypingContext {
  readonly typeDefinitions: ReadonlyMap<string, TypeDefinitionTypingContext>;
  readonly interfaces: ReadonlyMap<string, UnoptimizedInterfaceTypingContext>;
  readonly classes: ReadonlyMap<string, UnoptimizedInterfaceTypingContext>;
}

type InterfaceInliningCollector = Array<{
  readonly functions: Map<string, MemberTypeInformation>;
  readonly methods: Map<string, MemberTypeInformation>;
  readonly baseInterfaceTypes: readonly SamlangIdentifierType[];
}>;

function recursiveComputeInterfaceMembersChain(
  interfaceType: SamlangIdentifierType,
  unoptimizedGlobalTypingContext: ReadonlyHashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  collector: InterfaceInliningCollector,
  visited: HashMap<ModuleReference, Set<string>>,
  errorReporter: GlobalErrorReporter,
) {
  const visitedTypesInModule = visited.get(interfaceType.moduleReference) ?? new Set();
  if (visitedTypesInModule.has(interfaceType.identifier)) {
    errorReporter.reportCyclicTypeDefinitionError(interfaceType);
    return;
  }
  visited.set(interfaceType.moduleReference, visitedTypesInModule.add(interfaceType.identifier));
  const interfaceContext = unoptimizedGlobalTypingContext
    .get(interfaceType.moduleReference)
    ?.interfaces?.get(interfaceType.identifier);
  if (interfaceContext == null) return;
  const substitutionMapping = new Map(
    zip(
      interfaceContext.typeParameters.map((it) => it.name),
      interfaceType.typeArguments,
    ),
  );
  const inlinedMethods = new Map(
    Array.from(interfaceContext.methods, ([name, { isPublic, typeParameters, type }]) => [
      name,
      {
        isPublic,
        typeParameters: typeParameters.map((it) => ({
          name: it.name,
          bound:
            it.bound != null
              ? (performTypeSubstitution(it.bound, substitutionMapping) as SamlangIdentifierType)
              : null,
        })),
        type: performTypeSubstitution(type, substitutionMapping) as SamlangFunctionType,
      },
    ]),
  );
  const baseInterfaceTypes = interfaceContext.extendsOrImplements.map(
    (it) => performTypeSubstitution(it, substitutionMapping) as SamlangIdentifierType,
  );
  baseInterfaceTypes.forEach((it) => {
    recursiveComputeInterfaceMembersChain(
      it,
      unoptimizedGlobalTypingContext,
      collector,
      visited,
      errorReporter,
    );
  });
  collector.push({
    functions: new Map(interfaceContext.functions),
    methods: inlinedMethods,
    baseInterfaceTypes,
  });
}

function getFullyInlinedInterfaceContext(
  instantiatedInterfaceType: SamlangIdentifierType,
  unoptimizedGlobalTypingContext: ReadonlyHashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  errorReporter: GlobalErrorReporter,
): {
  readonly functions: Map<string, MemberTypeInformation>;
  readonly methods: Map<string, MemberTypeInformation>;
  readonly superTypes: readonly SamlangIdentifierType[];
} {
  const interfaceTypingContext = unoptimizedGlobalTypingContext
    .get(instantiatedInterfaceType.moduleReference)
    ?.interfaces?.get(instantiatedInterfaceType.identifier);
  if (interfaceTypingContext == null) {
    return { functions: new Map(), methods: new Map(), superTypes: [] };
  }
  const collector: InterfaceInliningCollector = [];
  recursiveComputeInterfaceMembersChain(
    instantiatedInterfaceType,
    unoptimizedGlobalTypingContext,
    collector,
    ModuleReferenceCollections.hashMapOf(),
    errorReporter,
  );
  const functions = new Map<string, MemberTypeInformation>();
  const methods = new Map<string, MemberTypeInformation>();
  const superTypes: SamlangIdentifierType[] = [];
  collector.forEach((it) => {
    // Shadowing is allowed, as long as type matches.
    it.functions.forEach((type, name) => functions.set(name, type));
    it.methods.forEach((type, name) => methods.set(name, type));
    superTypes.push(...it.baseInterfaceTypes);
  });
  superTypes.push(instantiatedInterfaceType);
  return { functions, methods, superTypes };
}

function checkClassMemberTypeConformance(
  expected: MemberTypeInformation,
  actual: MemberTypeInformation,
  errorReporter: GlobalErrorReporter,
): void {
  if (expected.typeParameters.length !== actual.typeParameters.length) {
    errorReporter.reportArityMismatchError(
      actual.type.reason.useLocation,
      'type parameters',
      expected.typeParameters.length,
      actual.typeParameters.length,
    );
    return;
  }
  let hasTypeParameterConformanceErrors = false;
  for (const [e, a] of zip(expected.typeParameters, actual.typeParameters)) {
    if (e.name !== a.name) {
      hasTypeParameterConformanceErrors = true;
      break;
    }
    if (e.bound == null && a.bound != null) {
      hasTypeParameterConformanceErrors = true;
      break;
    } else if (e.bound != null && a.bound == null) {
      hasTypeParameterConformanceErrors = true;
      break;
    } else if (e.bound != null && a.bound != null && !isTheSameType(e.bound, a.bound)) {
      hasTypeParameterConformanceErrors = true;
      break;
    }
  }
  if (hasTypeParameterConformanceErrors) {
    errorReporter.reportTypeParameterMismatchError(
      actual.type.reason.useLocation,
      expected.typeParameters,
    );
  } else if (!isTheSameType(expected.type, actual.type)) {
    errorReporter.reportUnexpectedTypeError(
      actual.type.reason.useLocation,
      expected.type,
      actual.type,
    );
  }
}

export function getFullyInlinedMultipleInterfaceContext(
  instantiatedInterfaceTypes: readonly SamlangIdentifierType[],
  unoptimizedGlobalTypingContext: ReadonlyHashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  errorReporter: GlobalErrorReporter,
): ReturnType<typeof getFullyInlinedInterfaceContext> {
  const acc = {
    functions: new Map<string, MemberTypeInformation>(),
    methods: new Map<string, MemberTypeInformation>(),
    superTypes: [] as SamlangIdentifierType[],
  };

  function validateAndPatch(
    existingMap: Map<string, MemberTypeInformation>,
    newlyInlinedMap: Map<string, MemberTypeInformation>,
  ) {
    for (const [name, info] of newlyInlinedMap) {
      const existing = existingMap.get(name);
      if (existing != null) {
        checkClassMemberTypeConformance(existing, info, errorReporter);
      }
      existingMap.set(name, info);
    }
  }

  instantiatedInterfaceTypes.forEach((instantiatedInterfaceType) => {
    if (
      unoptimizedGlobalTypingContext
        .get(instantiatedInterfaceType.moduleReference)
        ?.classes.has(instantiatedInterfaceType.identifier)
    ) {
      errorReporter.reportUnexpectedTypeKindError(
        instantiatedInterfaceType.reason.useLocation,
        'interface type',
        'class type',
      );
    } else if (
      !unoptimizedGlobalTypingContext
        .get(instantiatedInterfaceType.moduleReference)
        ?.interfaces.has(instantiatedInterfaceType.identifier)
    ) {
      errorReporter.reportUnresolvedNameError(
        instantiatedInterfaceType.reason.useLocation,
        instantiatedInterfaceType.identifier,
      );
    }

    const inlined = getFullyInlinedInterfaceContext(
      instantiatedInterfaceType,
      unoptimizedGlobalTypingContext,
      errorReporter,
    );
    validateAndPatch(acc.functions, inlined.functions);
    validateAndPatch(acc.methods, inlined.methods);
    acc.superTypes.push(...inlined.superTypes);
  });

  return acc;
}

function checkModuleMemberInterfaceConformance(
  unoptimizedGlobalTypingContext: ReadonlyHashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  actualInterface: SourceInterfaceDeclaration,
  errorReporter: GlobalErrorReporter,
  isClass: boolean,
): ReturnType<typeof getFullyInlinedInterfaceContext> {
  const fullyInlinedInterfaceContext = getFullyInlinedMultipleInterfaceContext(
    actualInterface.extendsOrImplementsNodes,
    unoptimizedGlobalTypingContext,
    errorReporter,
  );

  function checkClassMemberConformance(
    expectedIsMethod: boolean,
    expected: MemberTypeInformation,
    actual: SourceClassMemberDeclaration,
  ): void {
    // We first filter out incompatible kind
    if (expectedIsMethod && !actual.isMethod) {
      errorReporter.reportUnexpectedTypeKindError(actual.location, 'method', 'function');
      return;
    }
    if (!expectedIsMethod && actual.isMethod) {
      errorReporter.reportUnexpectedTypeKindError(actual.location, 'function', 'method');
      return;
    }
    if (!actual.isPublic) {
      errorReporter.reportUnexpectedTypeKindError(
        actual.location,
        'public class member',
        'private class member',
      );
    }
    checkClassMemberTypeConformance(
      expected,
      {
        isPublic: actual.isPublic,
        typeParameters: actual.typeParameters.map(({ name: { name }, bound }) => ({ name, bound })),
        type: actual.type,
      },
      errorReporter,
    );
  }

  const actualMembersMap = new Map(
    actualInterface.members.map((member) => [member.name.name, member]),
  );
  const missingMembers: string[] = [];
  for (const [name, expectedMember] of fullyInlinedInterfaceContext.functions) {
    const actualMember = actualMembersMap.get(name);
    if (actualMember == null) {
      missingMembers.push(name);
      continue;
    }
    checkClassMemberConformance(false, expectedMember, actualMember);
  }
  for (const [name, expectedMember] of fullyInlinedInterfaceContext.methods) {
    const actualMember = actualMembersMap.get(name);
    if (actualMember == null) {
      missingMembers.push(name);
      continue;
    }
    checkClassMemberConformance(true, expectedMember, actualMember);
  }
  if (isClass && missingMembers.length > 0) {
    errorReporter.reportMissingDefinitionsError(actualInterface.location, missingMembers);
  }

  return fullyInlinedInterfaceContext;
}

function optimizeGlobalTypingContextWithInterfaceConformanceChecking(
  sources: Sources<SamlangModule>,
  unoptimizedGlobalTypingContext: ReadonlyHashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  builtinModuleTypes: ModuleTypingContext,
  errorReporter: GlobalErrorReporter,
): GlobalTypingContext {
  const optimizedGlobalTypingContext = ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
    ModuleReference.ROOT,
    builtinModuleTypes,
  ]);
  sources.forEach((samlangModule, moduleReference) => {
    const moduleTypingContext = unoptimizedGlobalTypingContext.forceGet(moduleReference);
    const optimizedModuleTypingContext = {
      typeDefinitions: moduleTypingContext.typeDefinitions,
      interfaces: new Map<string, InterfaceTypingContext>(),
    };
    samlangModule.classes.forEach((declaration) => {
      const fullyInlinedInterfaceContext = checkModuleMemberInterfaceConformance(
        unoptimizedGlobalTypingContext,
        declaration,
        errorReporter,
        /* reportMissingMembers */ true,
      );
      const unoptimizedClassTypingContext = checkNotNull(
        moduleTypingContext.classes.get(declaration.name.name),
      );
      optimizedModuleTypingContext.interfaces.set(declaration.name.name, {
        isConcrete: true,
        functions: unoptimizedClassTypingContext.functions,
        methods: unoptimizedClassTypingContext.methods,
        typeParameters: unoptimizedClassTypingContext.typeParameters,
        superTypes: fullyInlinedInterfaceContext.superTypes,
      });
    });
    samlangModule.interfaces.forEach((declaration) => {
      const fullyInlinedInterfaceContext = checkModuleMemberInterfaceConformance(
        unoptimizedGlobalTypingContext,
        declaration,
        errorReporter,
        /* reportMissingMembers */ false,
      );
      const unoptimizedInterfaceTypingContext = checkNotNull(
        moduleTypingContext.interfaces.get(declaration.name.name),
      );
      unoptimizedInterfaceTypingContext.functions.forEach((info, name) => {
        fullyInlinedInterfaceContext.functions.set(name, info);
      });
      unoptimizedInterfaceTypingContext.methods.forEach((info, name) => {
        fullyInlinedInterfaceContext.methods.set(name, info);
      });
      optimizedModuleTypingContext.interfaces.set(declaration.name.name, {
        isConcrete: false,
        functions: fullyInlinedInterfaceContext.functions,
        methods: fullyInlinedInterfaceContext.methods,
        typeParameters: unoptimizedInterfaceTypingContext.typeParameters,
        superTypes: fullyInlinedInterfaceContext.superTypes,
      });
    });
    optimizedGlobalTypingContext.set(moduleReference, optimizedModuleTypingContext);
  });
  return optimizedGlobalTypingContext;
}

export function buildGlobalTypingContext(
  sources: Sources<SamlangModule>,
  errorReporter: GlobalErrorReporter,
  builtinModuleTypes: ModuleTypingContext = DEFAULT_BUILTIN_TYPING_CONTEXT,
): GlobalTypingContext {
  const unoptimizedGlobalTypingContext =
    ModuleReferenceCollections.hashMapOf<UnoptimizedModuleTypingContext>();

  function buildInterfaceTypingContext({
    typeParameters,
    members,
    extendsOrImplementsNodes,
  }: SourceInterfaceDeclaration) {
    const functions = new Map<string, MemberTypeInformation>();
    const methods = new Map<string, MemberTypeInformation>();
    members.forEach(({ name, isPublic, isMethod, type, typeParameters: memberTypeParameters }) => {
      const typeInformation: MemberTypeInformation = {
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
      extendsOrImplements: extendsOrImplementsNodes,
      functions,
      methods,
    };
  }

  function buildClassTypingContext(
    moduleReference: ModuleReference,
    classDefinition: SourceClassDefinition,
  ): UnoptimizedInterfaceTypingContext {
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
          typeDefinition.names.map((it) => checkNotNull(typeDefinition.mappings.get(it.name)).type),
          classType,
        ),
      });
    } else {
      for (const [tag, { type }] of typeDefinition.mappings) {
        functions.set(tag, {
          isPublic: true,
          typeParameters,
          type: SourceFunctionType(typeDefinitionReason, [type], classType),
        });
      }
    }
    return {
      typeParameters,
      extendsOrImplements: classDefinition.extendsOrImplementsNodes,
      functions,
      methods,
    };
  }

  sources.forEach((samlangModule, moduleReference) => {
    unoptimizedGlobalTypingContext.set(moduleReference, {
      typeDefinitions: new Map(
        samlangModule.classes.map(({ name: { name }, typeDefinition }) => [
          name,
          {
            type: typeDefinition.type,
            names: typeDefinition.names.map((it) => it.name),
            mappings: typeDefinition.mappings,
          },
        ]),
      ),
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
    });
  });

  return optimizeGlobalTypingContextWithInterfaceConformanceChecking(
    sources,
    unoptimizedGlobalTypingContext,
    builtinModuleTypes,
    errorReporter,
  );
}
