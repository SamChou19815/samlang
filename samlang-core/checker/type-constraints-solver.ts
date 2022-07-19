import { moduleReferenceToString, SourceReason } from '../ast/common-nodes';
import { SamlangType, SourceUnknownType, TypeParameterSignature } from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { zip } from '../utils';
import contextualTypeMeet from './contextual-type-meet';
import performTypeSubstitution from './type-substitution';

function solveTypeConstraintsInternal(
  concreteType: SamlangType,
  genericType: SamlangType,
  typeParameters: ReadonlySet<string>,
  partiallySolved: Map<string, SamlangType>,
): void {
  // Unknown types, which might come from expressions that need to be contextually typed (e.g. lambda),
  // do not participate in constraint solving.
  if (concreteType.__type__ === 'UnknownType') return;
  switch (genericType.__type__) {
    case 'PrimitiveType':
      return;
    case 'IdentifierType':
      if (
        typeParameters.has(genericType.identifier) &&
        !partiallySolved.has(genericType.identifier)
      ) {
        partiallySolved.set(genericType.identifier, concreteType);
        return;
      }
      if (
        concreteType.__type__ === 'IdentifierType' &&
        moduleReferenceToString(concreteType.moduleReference) ===
          moduleReferenceToString(genericType.moduleReference) &&
        concreteType.identifier === genericType.identifier &&
        concreteType.typeArguments.length === genericType.typeArguments.length
      ) {
        zip(concreteType.typeArguments, genericType.typeArguments).map(([c, g]) =>
          solveTypeConstraintsInternal(c, g, typeParameters, partiallySolved),
        );
      }
      return;
    case 'FunctionType':
      if (
        concreteType.__type__ === 'FunctionType' &&
        concreteType.argumentTypes.length === genericType.argumentTypes.length
      ) {
        zip(concreteType.argumentTypes, genericType.argumentTypes).map(([g, s]) =>
          solveTypeConstraintsInternal(g, s, typeParameters, partiallySolved),
        );
        solveTypeConstraintsInternal(
          concreteType.returnType,
          genericType.returnType,
          typeParameters,
          partiallySolved,
        );
      }
      return;
  }
}

interface TypeConstraintSolution {
  readonly solvedSubstitution: ReadonlyMap<string, SamlangType>;
  readonly solvedGenericType: SamlangType;
  readonly solvedContextuallyTypedConcreteType: SamlangType;
}

export function solveMultipleTypeConstraints(
  constraints: readonly { readonly concreteType: SamlangType; readonly genericType: SamlangType }[],
  typeParameters: readonly TypeParameterSignature[],
): Map<string, SamlangType> {
  const solvedSubstitution = new Map<string, SamlangType>();
  const typeParameterSet = new Set(typeParameters.map((it) => it.name));
  constraints.forEach(({ concreteType, genericType }) =>
    solveTypeConstraintsInternal(concreteType, genericType, typeParameterSet, solvedSubstitution),
  );
  return solvedSubstitution;
}

export function solveTypeConstraints(
  concreteType: SamlangType,
  genericType: SamlangType,
  typeParameters: readonly TypeParameterSignature[],
  errorReporter: GlobalErrorReporter,
): TypeConstraintSolution {
  const solvedSubstitution = solveMultipleTypeConstraints(
    [{ concreteType, genericType }],
    typeParameters,
  );
  typeParameters.forEach((typeParameter) => {
    if (!solvedSubstitution.has(typeParameter.name)) {
      // Fill in unknown for unsolved types.
      solvedSubstitution.set(
        typeParameter.name,
        SourceUnknownType(SourceReason(concreteType.reason.useLocation, null)),
      );
    }
  });
  const solvedGenericType = performTypeSubstitution(genericType, new Map(solvedSubstitution));
  const solvedContextuallyTypedConcreteType = contextualTypeMeet(
    solvedGenericType,
    concreteType,
    errorReporter,
  );
  return { solvedSubstitution, solvedGenericType, solvedContextuallyTypedConcreteType };
}
