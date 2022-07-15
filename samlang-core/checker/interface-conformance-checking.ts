import { DummySourceReason, ModuleReference, Sources } from '../ast/common-nodes';
import {
  isTheSameType,
  SamlangModule,
  SourceClassMemberDeclaration,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import performTypeSubstitution from './type-substitution';
import {
  AccessibleGlobalTypingContext,
  GlobalTypingContext,
  InterfaceTypingContextInstantiatedMembers,
  MemberTypeInformation,
} from './typing-context';

function checkClassMemberConformance(
  expectedIsMethod: boolean,
  expected: MemberTypeInformation,
  actual: SourceClassMemberDeclaration,
  errorReporter: GlobalErrorReporter
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
    Object.fromEntries(
      expectedTypeParameters.map((name, i) => [
        name,
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, `_T${i}`, []),
      ])
    )
  );
  const actualType = performTypeSubstitution(
    actual.type,
    Object.fromEntries(
      actualTypeParameters.map((name, i) => [
        name,
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, `_T${i}`, []),
      ])
    )
  );
  if (!isTheSameType(expectedType, actualType)) {
    errorReporter.reportUnexpectedTypeError(actual.location, expectedType, actualType);
  }
}

function checkSingleInterfaceConformance(
  expected: InterfaceTypingContextInstantiatedMembers,
  actual: SourceInterfaceDeclaration,
  errorReporter: GlobalErrorReporter,
  reportMissingMembers: boolean
) {
  const actualMembersMap = new Map(actual.members.map((member) => [member.name.name, member]));
  const missingMembers: string[] = [];
  Object.entries(expected.functions).forEach(([name, expectedMember]) => {
    const actualMember = actualMembersMap.get(name);
    if (actualMember == null) {
      missingMembers.push(name);
      return;
    }
    checkClassMemberConformance(false, expectedMember, actualMember, errorReporter);
  });
  Object.entries(expected.methods).forEach(([name, expectedMember]) => {
    const actualMember = actualMembersMap.get(name);
    if (actualMember == null) {
      missingMembers.push(name);
      return;
    }
    checkClassMemberConformance(true, expectedMember, actualMember, errorReporter);
  });
  if (reportMissingMembers && missingMembers.length > 0) {
    errorReporter.reportMissingDefinitionsError(actual.location, missingMembers);
  }
}

function checkModuleMemberInterfaceConformance(
  typingContext: AccessibleGlobalTypingContext,
  actual: SourceInterfaceDeclaration,
  errorReporter: GlobalErrorReporter,
  reportMissingMembers: boolean
): void {
  const instantiatedInterfaceType = actual.extendsOrImplementsNode;
  if (instantiatedInterfaceType == null) return;
  const { context, cyclicType } =
    typingContext.getFullyInlinedInterfaceContext(instantiatedInterfaceType);
  if (cyclicType != null) errorReporter.reportCyclicTypeDefinitionError(cyclicType);
  checkSingleInterfaceConformance(context, actual, errorReporter, reportMissingMembers);
}

export default function checkSourcesInterfaceConformance(
  sources: Sources<SamlangModule>,
  globalTypingContext: GlobalTypingContext,
  errorReporter: GlobalErrorReporter
): void {
  sources.forEach((samlangModule, moduleReference) => {
    samlangModule.classes.forEach((declaration) => {
      checkModuleMemberInterfaceConformance(
        AccessibleGlobalTypingContext.fromInterface(
          moduleReference,
          globalTypingContext,
          declaration
        ),
        declaration,
        errorReporter,
        /* reportMissingMembers */ true
      );
    });
    samlangModule.interfaces.forEach((declaration) => {
      checkModuleMemberInterfaceConformance(
        AccessibleGlobalTypingContext.fromInterface(
          moduleReference,
          globalTypingContext,
          declaration
        ),
        declaration,
        errorReporter,
        /* reportMissingMembers */ false
      );
    });
  });
}
