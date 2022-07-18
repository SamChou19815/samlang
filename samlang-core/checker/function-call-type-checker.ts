import type { SamlangReason } from '../ast/common-nodes';
import {
  SamlangExpression,
  SamlangFunctionType,
  SamlangType,
  SourceUnknownType,
  TypeParameterSignature,
  typeReposition,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { assert, zip } from '../utils';
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

interface FunctionCallTypeCheckingResult {
  readonly solvedGenericType: SamlangFunctionType;
  readonly solvedReturnType: SamlangType;
  readonly checkedArguments: readonly SamlangExpression[];
}

export default function typeCheckFunctionCall(
  genericFunctionType: SamlangFunctionType,
  typeParameters: readonly TypeParameterSignature[],
  functionCallReason: SamlangReason,
  functionArguments: readonly SamlangExpression[],
  returnTypeHint: SamlangType | null,
  typeCheck: (e: SamlangExpression, hint: SamlangType | null) => SamlangExpression,
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
      checkedArguments: functionArguments,
    };
  }
  const partiallyCheckedArguments = functionArguments.map((it) => {
    if (argumentShouldBeTypeCheckedWithoutHint(it)) {
      return { e: typeCheck(it, null), checked: true };
    } else {
      return { e: it, checked: false };
    }
  });
  // Phase 1: Best effort inference through arguments that can be independently typed.
  const partiallySolvedSubstitution = solveMultipleTypeConstraints(
    zip(
      genericFunctionType.argumentTypes,
      partiallyCheckedArguments.map((it) => it.e.type),
    ).map(([genericType, concreteType]) => ({ genericType, concreteType })),
    typeParameters,
  );
  const partiallySolvedGenericType = performTypeSubstitution(
    genericFunctionType,
    Object.fromEntries(partiallySolvedSubstitution),
  );
  const unsolvedTypeParameters = typeParameters.filter(
    (typeParameter) => !partiallySolvedSubstitution.has(typeParameter.name),
  );
  assert(partiallySolvedGenericType.__type__ === 'FunctionType');
  typeParameters.forEach((typeParameter) => {
    if (!partiallySolvedSubstitution.has(typeParameter.name)) {
      // Fill in unknown for unsolved types.
      partiallySolvedSubstitution.set(typeParameter.name, SourceUnknownType(functionCallReason));
    }
  });
  const partiallySolvedGenericTypeWithUnsolvedReplacedWithUnknown = performTypeSubstitution(
    genericFunctionType,
    Object.fromEntries(partiallySolvedSubstitution),
  );
  assert(partiallySolvedGenericTypeWithUnsolvedReplacedWithUnknown.__type__ === 'FunctionType');
  const partiallySolvedConcreteArgumentTypes = zip(
    partiallySolvedGenericTypeWithUnsolvedReplacedWithUnknown.argumentTypes,
    partiallyCheckedArguments.map((it) => it.e.type),
  ).map(([g, s]) => contextualTypeMeet(g, s, errorReporter));
  const checkedArguments = zip(partiallyCheckedArguments, partiallySolvedConcreteArgumentTypes).map(
    ([{ e, checked }, hint]) => (checked ? e : typeCheck(e, hint)),
  );

  // Phase 2: Use fully checked arguments to infer remaining type parameters.
  const phase2ArgumentsConstraints = zip(
    partiallySolvedGenericType.argumentTypes,
    checkedArguments.map((it) => it.type),
  ).map(([genericType, concreteType]) => ({ genericType, concreteType }));
  if (returnTypeHint != null) {
    phase2ArgumentsConstraints.push({
      genericType: partiallySolvedGenericType.returnType,
      concreteType: returnTypeHint,
    });
  }
  const fullySolvedSubstitution = solveMultipleTypeConstraints(
    phase2ArgumentsConstraints,
    unsolvedTypeParameters,
  );
  const stillUnresolvedTypeParameters = unsolvedTypeParameters.filter(
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
    partiallySolvedGenericType,
    Object.fromEntries(fullySolvedSubstitution),
  );
  assert(fullySolvedGenericType.__type__ === 'FunctionType');
  const fullySolvedConcreteReturnType = contextualTypeMeet(
    returnTypeHint ?? SourceUnknownType(functionCallReason),
    typeReposition(fullySolvedGenericType.returnType, functionCallReason.useLocation),
    errorReporter,
  );

  return {
    solvedGenericType: fullySolvedGenericType,
    solvedReturnType: fullySolvedConcreteReturnType,
    checkedArguments,
  };
}
