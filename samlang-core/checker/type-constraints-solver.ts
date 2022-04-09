import { moduleReferenceToString, SourceReason } from '../ast/common-nodes';
import { SamlangType, SourceUnknownType } from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, zip } from '../utils';
import contextualTypeMeet from './contextual-type-meet';
import performTypeSubstitution from './type-substitution';

function solveTypeConstraintsInternal(
  concreteType: SamlangType,
  genericType: SamlangType,
  typeParameters: ReadonlySet<string>,
  partiallySolved: Map<string, SamlangType>
): void {
  // Unknown types, which might come from expressions that need to be contextually typed (e.g. lambda),
  // do not participate in constraint solving.
  if (concreteType.type === 'PrimitiveType' && concreteType.name === 'unknown') return;
  assert(genericType.type !== 'UndecidedType');
  switch (genericType.type) {
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
        concreteType.type === 'IdentifierType' &&
        moduleReferenceToString(concreteType.moduleReference) ===
          moduleReferenceToString(genericType.moduleReference) &&
        concreteType.identifier === genericType.identifier &&
        concreteType.typeArguments.length === genericType.typeArguments.length
      ) {
        zip(concreteType.typeArguments, genericType.typeArguments).map(([c, g]) =>
          solveTypeConstraintsInternal(c, g, typeParameters, partiallySolved)
        );
      }
      return;
    case 'FunctionType':
      if (
        concreteType.type === 'FunctionType' &&
        concreteType.argumentTypes.length === genericType.argumentTypes.length
      ) {
        zip(concreteType.argumentTypes, genericType.argumentTypes).map(([g, s]) =>
          solveTypeConstraintsInternal(g, s, typeParameters, partiallySolved)
        );
        solveTypeConstraintsInternal(
          concreteType.returnType,
          genericType.returnType,
          typeParameters,
          partiallySolved
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

export default function solveTypeConstraints(
  concreteType: SamlangType,
  genericType: SamlangType,
  typeParameters: readonly string[],
  errorCollector: ModuleErrorCollector
): TypeConstraintSolution {
  const solvedSubstitution = new Map<string, SamlangType>();
  solveTypeConstraintsInternal(
    concreteType,
    genericType,
    new Set(typeParameters),
    solvedSubstitution
  );
  typeParameters.forEach((typeParameter) => {
    if (!solvedSubstitution.has(typeParameter)) {
      // Fill in unknown for unsolved types.
      solvedSubstitution.set(
        typeParameter,
        SourceUnknownType(SourceReason(concreteType.reason.definitionLocation, null))
      );
    }
  });
  const solvedGenericType = performTypeSubstitution(
    genericType,
    Object.fromEntries(solvedSubstitution)
  );
  const solvedContextuallyTypedConcreteType = contextualTypeMeet(
    solvedGenericType,
    concreteType,
    errorCollector
  );
  return { solvedSubstitution, solvedGenericType, solvedContextuallyTypedConcreteType };
}
