import { DummySourceReason, ModuleReference } from '../ast/common-nodes';
import {
  isTheSameType,
  SourceClassMemberDeclaration,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import performTypeSubstitution from './type-substitution';
import type { InterfaceTypingContext, MemberTypeInformation } from './typing-context';

function checkClassMemberConformance(
  expectedClassTypeParameters: readonly string[],
  actualClassTypeParameters: readonly string[],
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
  if (expectedIsMethod && actual.isMethod) {
    expectedTypeParameters.push(...expectedClassTypeParameters);
    actualTypeParameters.push(...actualClassTypeParameters);
  }
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

function _checkInterfaceComformance(
  expected: InterfaceTypingContext,
  actual: SourceInterfaceDeclaration,
  errorReporter: GlobalErrorReporter
) {
  const expectedClassTypeParameters = expected.typeParameters;
  const actualClassTypeParameters = actual.typeParameters.map((it) => it.name);
  const actualMembersMap = new Map(actual.members.map((member) => [member.name.name, member]));
  const missingMembers: string[] = [];
  Object.entries(expected.functions).forEach(([name, expectedMember]) => {
    const actualMember = actualMembersMap.get(name);
    if (actualMember == null) {
      missingMembers.push(name);
      return;
    }
    checkClassMemberConformance(
      expectedClassTypeParameters,
      actualClassTypeParameters,
      false,
      expectedMember,
      actualMember,
      errorReporter
    );
  });
  Object.entries(expected.methods).forEach(([name, expectedMember]) => {
    const actualMember = actualMembersMap.get(name);
    if (actualMember == null) {
      missingMembers.push(name);
      return;
    }
    checkClassMemberConformance(
      expectedClassTypeParameters,
      actualClassTypeParameters,
      true,
      expectedMember,
      actualMember,
      errorReporter
    );
  });
  if (missingMembers.length > 0) {
    // TODO: error on this
  }
}
