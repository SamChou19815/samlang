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
  TypeDefinition,
  TypeParameterSignature,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { checkNotNull, HashMap, ReadonlyHashMap, zip } from '../utils';
import performTypeSubstitution from './type-substitution';
import {
  ClassTypingContext,
  DEFAULT_BUILTIN_TYPING_CONTEXT,
  GlobalTypingContext,
  InterfaceTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
} from './typing-context';

interface UnoptimizedInterfaceTypingContext {
  readonly functions: ReadonlyMap<string, MemberTypeInformation>;
  readonly methods: ReadonlyMap<string, MemberTypeInformation>;
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly extendsOrImplements: SamlangIdentifierType | null;
}

interface UnoptimizedClassTypingContext extends UnoptimizedInterfaceTypingContext {
  readonly typeDefinition: TypeDefinition;
}

interface UnoptimizedModuleTypingContext {
  readonly interfaces: ReadonlyMap<string, UnoptimizedInterfaceTypingContext>;
  readonly classes: ReadonlyMap<string, UnoptimizedClassTypingContext>;
}

type InterfaceInliningCollector = Array<{
  readonly functions: Map<string, MemberTypeInformation>;
  readonly methods: Map<string, MemberTypeInformation>;
  readonly baseInterfaceType: SamlangIdentifierType | null;
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
  if (interfaceContext == null) return null;
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
  const baseInterfaceType =
    interfaceContext.extendsOrImplements != null
      ? (performTypeSubstitution(
          interfaceContext.extendsOrImplements,
          substitutionMapping,
        ) as SamlangIdentifierType)
      : null;
  if (baseInterfaceType != null) {
    recursiveComputeInterfaceMembersChain(
      baseInterfaceType,
      unoptimizedGlobalTypingContext,
      collector,
      visited,
      errorReporter,
    );
  }
  collector.push({
    functions: new Map(interfaceContext.functions),
    methods: inlinedMethods,
    baseInterfaceType,
  });
}

export function getFullyInlinedInterfaceContext(
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
    if (it.baseInterfaceType != null) superTypes.push(it.baseInterfaceType);
  });
  return { functions, methods, superTypes };
}

function checkModuleMemberInterfaceConformance(
  unoptimizedGlobalTypingContext: ReadonlyHashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  actualInterface: SourceInterfaceDeclaration,
  errorReporter: GlobalErrorReporter,
  reportMissingMembers: boolean,
): ReturnType<typeof getFullyInlinedInterfaceContext> {
  const instantiatedInterfaceType = actualInterface.extendsOrImplementsNode;
  if (instantiatedInterfaceType == null) {
    return { functions: new Map(), methods: new Map(), superTypes: [] };
  }
  const fullyInlinedInterfaceContext = getFullyInlinedInterfaceContext(
    instantiatedInterfaceType,
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
    if (expected.typeParameters.length !== actual.typeParameters.length) {
      errorReporter.reportArityMismatchError(
        actual.location,
        'type parameters',
        expected.typeParameters.length,
        actual.typeParameters.length,
      );
      return;
    }
    let noTypeParameterConformanceErrors = true;
    for (const [e, a] of zip(expected.typeParameters, actual.typeParameters)) {
      if (e.name !== a.name.name) {
        errorReporter.reportTypeParameterNameMismatchError(a.name.location, e.name, a.name.name);
        noTypeParameterConformanceErrors = false;
      }
      if (e.bound == null && a.bound != null) {
        errorReporter.reportUnexpectedTypeKindError(
          a.bound.reason.useLocation,
          'unbounded type parameter',
          'bounded type parameter',
        );
        noTypeParameterConformanceErrors = false;
      } else if (e.bound != null && a.bound == null) {
        errorReporter.reportUnexpectedTypeKindError(
          actual.location,
          'bounded type parameter',
          'unbounded type parameter',
        );
        noTypeParameterConformanceErrors = false;
      } else if (e.bound != null && a.bound != null && !isTheSameType(e.bound, a.bound)) {
        errorReporter.reportUnexpectedTypeError(actual.location, e.bound, a.bound);
        noTypeParameterConformanceErrors = false;
      }
    }
    if (noTypeParameterConformanceErrors && !isTheSameType(expected.type, actual.type)) {
      errorReporter.reportUnexpectedTypeError(actual.location, expected.type, actual.type);
    }
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
  if (reportMissingMembers && missingMembers.length > 0) {
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
      classes: new Map<string, ClassTypingContext>(),
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
      optimizedModuleTypingContext.classes.set(declaration.name.name, {
        functions: unoptimizedClassTypingContext.functions,
        methods: unoptimizedClassTypingContext.methods,
        typeParameters: unoptimizedClassTypingContext.typeParameters,
        typeDefinition: unoptimizedClassTypingContext.typeDefinition,
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
      functions,
      methods,
    };
  }

  function buildClassTypingContext(
    moduleReference: ModuleReference,
    classDefinition: SourceClassDefinition,
  ): UnoptimizedClassTypingContext {
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
      functions,
      methods,
    };
  }

  sources.forEach((samlangModule, moduleReference) => {
    unoptimizedGlobalTypingContext.set(moduleReference, {
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
