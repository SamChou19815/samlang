import type { SamlangReason } from '../ast/common-nodes';
import {
  SamlangExpression,
  SamlangFunctionType,
  SamlangType,
  SourceFunctionType,
  SourceUnknownType,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
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
        argumentShouldBeTypeCheckedWithoutHint(it.expression)
      );
    case 'StatementBlockExpression':
      return (
        expression.block.expression == null ||
        argumentShouldBeTypeCheckedWithoutHint(expression.block.expression)
      );
    case 'LambdaExpression': {
      return (
        expression.parameters.every(
          ([, annotation]) => annotation.type !== 'PrimitiveType' || annotation.name !== 'unknown'
        ) && argumentShouldBeTypeCheckedWithoutHint(expression.body)
      );
    }
  }
}

interface FunctionCallTypeCheckingResult {
  readonly solvedGenericType: SamlangFunctionType;
  readonly checkedArguments: readonly SamlangExpression[];
}

export default function typeCheckFunctionCall(
  genericFunctionType: SamlangFunctionType,
  typeParameters: readonly string[],
  functionCallReason: SamlangReason,
  functionArguments: readonly SamlangExpression[],
  returnTypeHint: SamlangType | null,
  typeCheck: (e: SamlangExpression, hint: SamlangType | null) => SamlangExpression,
  errorCollector: ModuleErrorCollector
): FunctionCallTypeCheckingResult {
  const partiallyCheckedArguments = functionArguments.map((it) => {
    if (argumentShouldBeTypeCheckedWithoutHint(it)) {
      return { e: typeCheck(it, null), checked: true };
    } else {
      return { e: it, checked: false };
    }
  });
  const unsolvedReturnType =
    returnTypeHint != null
      ? { ...returnTypeHint, reason: functionCallReason }
      : SourceUnknownType(functionCallReason);
  const solvedSubstitution = solveMultipleTypeConstraints(
    [
      ...zip(
        genericFunctionType.argumentTypes,
        partiallyCheckedArguments.map((it) => it.e.type)
      ).map(([genericType, concreteType]) => ({ genericType, concreteType })),
      {
        genericType: genericFunctionType.returnType,
        concreteType: unsolvedReturnType,
      },
    ],
    functionCallReason,
    typeParameters
  );
  const solvedGenericType = performTypeSubstitution(
    genericFunctionType,
    Object.fromEntries(solvedSubstitution)
  );
  assert(solvedGenericType.type === 'FunctionType');
  const solvedConcreteArgumentTypes = zip(
    solvedGenericType.argumentTypes,
    partiallyCheckedArguments.map((it) => it.e.type)
  ).map(([g, s]) => contextualTypeMeet(g, s, errorCollector));
  const solvedConcreteReturnType = {
    ...contextualTypeMeet(unsolvedReturnType, solvedGenericType.returnType, errorCollector),
    reason: functionCallReason,
  };
  const solvedContextuallyTypedConcreteType = SourceFunctionType(
    functionCallReason,
    solvedConcreteArgumentTypes,
    solvedConcreteReturnType
  );
  const checkedArguments = zip(
    partiallyCheckedArguments,
    solvedContextuallyTypedConcreteType.argumentTypes
  ).map(([{ e, checked }, hint]) => (checked ? e : typeCheck(e, hint)));
  return { solvedGenericType, checkedArguments };
}
