import {
  DummySourceReason,
  ModuleReference,
  ModuleReferenceCollections,
  Sources,
} from '../ast/common-nodes';
import {
  isTheSameType,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangModule,
  SourceClassMemberDeclaration,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { checkNotNull, HashMap, zip } from '../utils';
import performTypeSubstitution from './type-substitution';
import type {
  ClassTypingContext,
  GlobalTypingContext,
  InterfaceTypingContext,
  MemberTypeInformation,
  ModuleTypingContext,
} from './typing-context';

type InterfaceInliningCollector = Array<{
  readonly functions: Map<string, MemberTypeInformation>;
  readonly methods: Map<string, MemberTypeInformation>;
  readonly baseInterfaceType: SamlangIdentifierType | null;
}>;

function recursiveComputeInterfaceMembersChain(
  interfaceType: SamlangIdentifierType,
  globalTypingContext: GlobalTypingContext,
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
  const interfaceContext = globalTypingContext
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
        typeParameters,
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
      globalTypingContext,
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
  globalTypingContext: GlobalTypingContext,
  errorReporter: GlobalErrorReporter,
): {
  readonly functions: Map<string, MemberTypeInformation>;
  readonly methods: Map<string, MemberTypeInformation>;
  readonly superTypes: readonly SamlangIdentifierType[];
} {
  const interfaceTypingContext = globalTypingContext
    .get(instantiatedInterfaceType.moduleReference)
    ?.interfaces?.get(instantiatedInterfaceType.identifier);
  if (interfaceTypingContext == null) {
    return { functions: new Map(), methods: new Map(), superTypes: [] };
  }
  const collector: InterfaceInliningCollector = [];
  recursiveComputeInterfaceMembersChain(
    instantiatedInterfaceType,
    globalTypingContext,
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
  globalTypingContext: GlobalTypingContext,
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
    globalTypingContext,
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
    const expectedTypeParameters = [...expected.typeParameters];
    const actualTypeParameters = [...actual.typeParameters.map((it) => it.name)];
    const expectedType = performTypeSubstitution(
      expected.type,
      new Map(
        expectedTypeParameters.map((name, i) => [
          name.name,
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, `_T${i}`, []),
        ]),
      ),
    );
    const actualType = performTypeSubstitution(
      actual.type,
      new Map(
        actualTypeParameters.map((name, i) => [
          name.name,
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, `_T${i}`, []),
        ]),
      ),
    );
    if (!isTheSameType(expectedType, actualType)) {
      errorReporter.reportUnexpectedTypeError(actual.location, expectedType, actualType);
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

export default function optimizeGlobalTypingContextWithInterfaceConformanceChecking(
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  errorReporter: GlobalErrorReporter,
): GlobalTypingContext {
  const optimizedGlobalTypingContext = ModuleReferenceCollections.hashMapOf<ModuleTypingContext>(
    ...globalTypingContext.entries(),
  );
  sources.forEach((samlangModule, moduleReference) => {
    const moduleTypingContext = globalTypingContext.forceGet(moduleReference);
    const optimizedModuleTypingContext = {
      classes: new Map<string, ClassTypingContext>(),
      interfaces: new Map<string, InterfaceTypingContext>(),
    };
    samlangModule.classes.forEach((declaration) => {
      const fullyInlinedInterfaceContext = checkModuleMemberInterfaceConformance(
        globalTypingContext,
        declaration,
        errorReporter,
        /* reportMissingMembers */ true,
      );
      const optimizedClassTypingContext = {
        ...checkNotNull(moduleTypingContext.classes.get(declaration.name.name)),
        superTypes: fullyInlinedInterfaceContext.superTypes,
      };
      optimizedModuleTypingContext.classes.set(declaration.name.name, optimizedClassTypingContext);
    });
    samlangModule.interfaces.forEach((declaration) => {
      const fullyInlinedInterfaceContext = checkModuleMemberInterfaceConformance(
        globalTypingContext,
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
        ...unoptimizedInterfaceTypingContext,
        ...fullyInlinedInterfaceContext,
      });
    });
    optimizedGlobalTypingContext.set(moduleReference, optimizedModuleTypingContext);
  });
  return optimizedGlobalTypingContext;
}
