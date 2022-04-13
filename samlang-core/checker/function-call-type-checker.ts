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
import solveTypeConstraints from './type-constraints-solver';

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
  const concreteFunctionType = SourceFunctionType(
    functionCallReason,
    partiallyCheckedArguments.map((it) => it.e.type),
    returnTypeHint != null
      ? { ...returnTypeHint, reason: functionCallReason }
      : SourceUnknownType(functionCallReason)
  );
  const { solvedContextuallyTypedConcreteType, solvedGenericType } = solveTypeConstraints(
    concreteFunctionType,
    genericFunctionType,
    typeParameters,
    errorCollector
  );
  assert(
    solvedContextuallyTypedConcreteType.type === 'FunctionType',
    solvedContextuallyTypedConcreteType.type
  );
  assert(solvedGenericType.type === 'FunctionType', solvedGenericType.type);
  const checkedArguments = zip(
    partiallyCheckedArguments,
    solvedContextuallyTypedConcreteType.argumentTypes
  ).map(([{ e, checked }, hint]) => (checked ? e : typeCheck(e, hint)));
  return { solvedGenericType, checkedArguments };
}
