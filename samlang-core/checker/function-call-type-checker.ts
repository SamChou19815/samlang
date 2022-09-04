import type { SamlangReason } from '../ast/common-nodes';
import {
  isTheSameType,
  SamlangExpression,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangType,
  SourceUnknownType,
  TypeParameterSignature,
  typeReposition,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { assert, checkNotNull, zip } from '../utils';
import contextualTypeMeet from './contextual-type-meet';
import { solveMultipleTypeConstraints } from './type-constraints-solver';
import performTypeSubstitution from './type-substitution';

function argumentShouldBeTypeCheckedWithoutHint(expression: SamlangExpression): boolean {
  switch (expression.__type__) {
    case 'LiteralExpression':
    case 'ThisExpression':
    case 'VariableExpression':
    case 'ClassMemberExpression':
    case 'FieldAccessExpression':
    case 'MethodAccessExpression':
    case 'FunctionCallExpression':
    case 'UnaryExpression':
    case 'BinaryExpression':
      return true;
    case 'IfElseExpression':
      return (
        argumentShouldBeTypeCheckedWithoutHint(expression.e1) &&
        argumentShouldBeTypeCheckedWithoutHint(expression.e2)
      );
    case 'MatchExpression':
      return expression.matchingList.every((it) =>
        argumentShouldBeTypeCheckedWithoutHint(it.expression),
      );
    case 'StatementBlockExpression':
      return (
        expression.block.expression == null ||
        argumentShouldBeTypeCheckedWithoutHint(expression.block.expression)
      );
    case 'LambdaExpression': {
      return (
        expression.parameters.every(({ typeAnnotation }) => typeAnnotation != null) &&
        argumentShouldBeTypeCheckedWithoutHint(expression.body)
      );
    }
  }
}

/**
 * Solve type arguments with the best effort with the provided information.
 * A function type with potentially less unknown slots will be returned.
 */
function solveTypeArguments(
  functionCallReason: SamlangReason,
  genericFunctionType: SamlangFunctionType,
  typeParameters: readonly TypeParameterSignature[],
  argumentTypes: readonly SamlangType[],
  returnTypeHint: SamlangType | null,
): SamlangFunctionType {
  const constraints = zip(genericFunctionType.argumentTypes, argumentTypes).map(
    ([genericType, concreteType]) => ({
      genericType,
      concreteType,
    }),
  );
  if (returnTypeHint != null) {
    constraints.push({
      genericType: genericFunctionType.returnType,
      concreteType: returnTypeHint,
    });
  }
  const partiallySolvedSubstitution = solveMultipleTypeConstraints(constraints, typeParameters);
  typeParameters.forEach((typeParameter) => {
    if (!partiallySolvedSubstitution.has(typeParameter.name)) {
      // Fill in unknown for unsolved types.
      partiallySolvedSubstitution.set(typeParameter.name, SourceUnknownType(functionCallReason));
    }
  });
  const partiallySolvedGenericTypeWithUnsolvedReplacedWithUnknown = performTypeSubstitution(
    genericFunctionType,
    partiallySolvedSubstitution,
  );
  assert(partiallySolvedGenericTypeWithUnsolvedReplacedWithUnknown.__type__ === 'FunctionType');
  return partiallySolvedGenericTypeWithUnsolvedReplacedWithUnknown;
}

export function validateTypeArguments(
  typeParameters: readonly TypeParameterSignature[],
  substitutionMap: ReadonlyMap<string, SamlangType>,
  isSubtype: (lower: SamlangType, upper: SamlangIdentifierType) => boolean,
  errorReporter: GlobalErrorReporter,
): void {
  typeParameters.forEach(({ name, bound }) => {
    const solvedTypeArgument = substitutionMap.get(name);
    if (solvedTypeArgument != null && bound != null) {
      const substitutedBound = performTypeSubstitution(bound, substitutionMap);
      if (
        !isTheSameType(solvedTypeArgument, substitutedBound) &&
        (substitutedBound.__type__ !== 'IdentifierType' ||
          !isSubtype(solvedTypeArgument, substitutedBound))
      ) {
        errorReporter.reportUnexpectedSubtypeError(
          solvedTypeArgument.reason.useLocation,
          substitutedBound,
          solvedTypeArgument,
        );
      }
    }
  });
}

interface FunctionCallTypeCheckingResult {
  readonly solvedGenericType: SamlangFunctionType;
  readonly solvedReturnType: SamlangType;
  readonly solvedSubstitution: ReadonlyMap<string, SamlangType>;
  readonly checkedArguments: readonly SamlangExpression[];
}

export default function typeCheckFunctionCall(
  genericFunctionType: SamlangFunctionType,
  typeParameters: readonly TypeParameterSignature[],
  functionCallReason: SamlangReason,
  functionArguments: readonly SamlangExpression[],
  returnTypeHint: SamlangType | null,
  typeCheck: (e: SamlangExpression, hint: SamlangType | null) => SamlangExpression,
  isSubtype: (lower: SamlangType, upper: SamlangIdentifierType) => boolean,
  errorReporter: GlobalErrorReporter,
): FunctionCallTypeCheckingResult {
  if (genericFunctionType.argumentTypes.length !== functionArguments.length) {
    errorReporter.reportArityMismatchError(
      functionCallReason.useLocation,
      'arguments',
      genericFunctionType.argumentTypes.length,
      functionArguments.length,
    );
    return {
      solvedGenericType: genericFunctionType,
      solvedReturnType: SourceUnknownType(functionCallReason),
      solvedSubstitution: new Map(),
      checkedArguments: functionArguments,
    };
  }
  // Phase 0: Initial Synthesis
  const partiallyCheckedArguments = functionArguments.map((it) => {
    if (argumentShouldBeTypeCheckedWithoutHint(it)) {
      return { e: typeCheck(it, null), checked: true };
    } else {
      return { e: it, checked: false };
    }
  });
  // Phase 1-n: Best effort inference through arguments that are already checked.
  for (let i = 0; i < partiallyCheckedArguments.length; i++) {
    const partiallyCheckedExpression = checkNotNull(partiallyCheckedArguments[i]);
    const bestEffortInstantiatedFunctionType = solveTypeArguments(
      functionCallReason,
      genericFunctionType,
      typeParameters,
      partiallyCheckedArguments.map((it) => it.e.type),
      returnTypeHint,
    );
    const hint = contextualTypeMeet(
      checkNotNull(bestEffortInstantiatedFunctionType.argumentTypes[i]),
      partiallyCheckedExpression.e.type,
      errorReporter,
    );
    if (partiallyCheckedExpression.checked) continue;
    const fullyCheckedExpression = typeCheck(partiallyCheckedExpression.e, hint);
    partiallyCheckedArguments[i] = { e: fullyCheckedExpression, checked: true };
  }

  // Phase n+1: Use fully checked arguments to infer remaining type parameters.
  const finalPhaseArgumentsConstraints = zip(
    genericFunctionType.argumentTypes,
    partiallyCheckedArguments.map((it) => it.e.type),
  ).map(([genericType, concreteType]) => ({ genericType, concreteType }));
  if (returnTypeHint != null) {
    finalPhaseArgumentsConstraints.push({
      genericType: genericFunctionType.returnType,
      concreteType: returnTypeHint,
    });
  }
  const fullySolvedSubstitution = solveMultipleTypeConstraints(
    finalPhaseArgumentsConstraints,
    typeParameters,
  );
  const stillUnresolvedTypeParameters = typeParameters.filter(
    (typeParameter) => !fullySolvedSubstitution.has(typeParameter.name),
  );
  stillUnresolvedTypeParameters.forEach((typeParameter) => {
    // Fill in unknown for unsolved types.
    fullySolvedSubstitution.set(typeParameter.name, SourceUnknownType(functionCallReason));
  });
  if (stillUnresolvedTypeParameters.length > 0) {
    errorReporter.reportInsufficientTypeInferenceContextError(functionCallReason.useLocation);
  }
  const fullySolvedGenericType = performTypeSubstitution(
    genericFunctionType,
    fullySolvedSubstitution,
  );
  assert(fullySolvedGenericType.__type__ === 'FunctionType');
  const fullySolvedConcreteReturnType = contextualTypeMeet(
    returnTypeHint ?? SourceUnknownType(functionCallReason),
    typeReposition(fullySolvedGenericType.returnType, functionCallReason.useLocation),
    errorReporter,
  );

  validateTypeArguments(typeParameters, fullySolvedSubstitution, isSubtype, errorReporter);
  const checkedArguments = partiallyCheckedArguments.map((it) => it.e);

  return {
    solvedGenericType: fullySolvedGenericType,
    solvedReturnType: fullySolvedConcreteReturnType,
    solvedSubstitution: fullySolvedSubstitution,
    checkedArguments,
  };
}
