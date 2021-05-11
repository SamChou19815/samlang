import type { ReadOnlyTypeResolution } from './type-resolution';
import resolveType from './type-resolver';

import {
  Type,
  IdentifierType,
  TupleType,
  FunctionType,
  unitType,
  boolType,
  intType,
  stringType,
  isTheSameType,
  prettyPrintType,
} from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import { assert, zip } from 'samlang-core-utils';

const checkedZip = <E1, E2>(
  list1: readonly E1[],
  list2: readonly E2[]
): readonly (readonly [E1, E2])[] => {
  assert(list1.length === list2.length, 'Slack type checker!');
  return zip(list1, list2);
};

const fixExpressionType = (
  expression: SamlangExpression,
  expectedType: Type,
  resolution: ReadOnlyTypeResolution
): SamlangExpression => {
  const typeFixItself = (type: Type, expected: Type | null): Type => {
    const resolvedPotentiallyUndecidedType = resolution.resolveType(type);
    const resolvedType = resolveType(resolvedPotentiallyUndecidedType, () => unitType);
    if (expected === null) {
      return resolvedType;
    }
    assert(
      isTheSameType(expected, resolvedType),
      `resolvedType(${prettyPrintType(
        resolvedType
      )}) should be consistent with expectedType(${prettyPrintType(expected)})!`
    );
    return expected;
  };

  const getExpressionFixedType = (e: SamlangExpression, t: Type | null): Type =>
    typeFixItself(e.type, t);

  const tryFixExpressionType = (e: SamlangExpression, t: Type): SamlangExpression =>
    fixExpressionType(e, t, resolution);

  switch (expression.__type__) {
    case 'LiteralExpression':
    case 'ThisExpression':
    case 'VariableExpression':
      return { ...expression, type: getExpressionFixedType(expression, expectedType) };
    case 'ClassMemberExpression':
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        typeArguments: expression.typeArguments.map((typeArgument) =>
          typeFixItself(typeArgument, null)
        ),
      };
    case 'TupleConstructorExpression': {
      const newType = typeFixItself(expression.type, expectedType) as TupleType;
      return {
        ...expression,
        type: newType,
        expressions: checkedZip(expression.expressions, newType.mappings).map(([element, type]) =>
          tryFixExpressionType(element, type)
        ),
      };
    }
    case 'ObjectConstructorExpression': {
      const newType = typeFixItself(expression.type, expectedType) as IdentifierType;
      const newDeclarations = expression.fieldDeclarations.map((fieldDeclaration) => {
        const betterType = typeFixItself(fieldDeclaration.type, null);
        if (fieldDeclaration.expression == null) {
          return { ...fieldDeclaration, type: betterType };
        }
        return {
          ...fieldDeclaration,
          type: betterType,
          expression: tryFixExpressionType(fieldDeclaration.expression, betterType),
        };
      });
      return { ...expression, type: newType, fieldDeclarations: newDeclarations };
    }
    case 'VariantConstructorExpression': {
      const newType = getExpressionFixedType(expression, expectedType) as IdentifierType;
      const data = tryFixExpressionType(expression.data, typeFixItself(expression.data.type, null));
      return { ...expression, type: newType, data };
    }
    case 'FieldAccessExpression':
    case 'MethodAccessExpression':
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        expression: tryFixExpressionType(
          expression.expression,
          getExpressionFixedType(expression.expression, null)
        ),
      };
    case 'UnaryExpression': {
      let fixedExpression: SamlangExpression;
      switch (expression.operator) {
        case '!':
          fixedExpression = tryFixExpressionType(expression.expression, boolType);
          break;
        case '-':
          fixedExpression = tryFixExpressionType(expression.expression, intType);
          break;
      }
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        expression: fixedExpression,
      };
    }
    case 'PanicExpression':
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        expression: tryFixExpressionType(expression.expression, stringType),
      };
    case 'BuiltInFunctionCallExpression': {
      let argumentExpression: SamlangExpression;
      switch (expression.functionName) {
        case 'intToString':
          argumentExpression = tryFixExpressionType(expression.argumentExpression, intType);
          break;
        case 'stringToInt':
          argumentExpression = tryFixExpressionType(expression.argumentExpression, stringType);
          break;
        case 'println':
          argumentExpression = tryFixExpressionType(expression.argumentExpression, stringType);
          break;
      }
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        argumentExpression,
      };
    }
    case 'FunctionCallExpression': {
      const functionFixedType = getExpressionFixedType(
        expression.functionExpression,
        null
      ) as FunctionType;
      assert(
        isTheSameType(functionFixedType.returnType, expectedType),
        `Return type (${prettyPrintType(
          functionFixedType.returnType
        )}$ mismatches with expected type (${prettyPrintType(expectedType)}).`
      );
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        functionExpression: tryFixExpressionType(expression.functionExpression, functionFixedType),
        functionArguments: checkedZip(
          expression.functionArguments,
          functionFixedType.argumentTypes
        ).map(([e, t]) => tryFixExpressionType(e, t)),
      };
    }
    case 'BinaryExpression': {
      let e1: SamlangExpression;
      let e2: SamlangExpression;
      switch (expression.operator.symbol) {
        case '*':
        case '/':
        case '%':
        case '+':
        case '-':
        case '<':
        case '<=':
        case '>':
        case '>=':
          e1 = tryFixExpressionType(expression.e1, intType);
          e2 = tryFixExpressionType(expression.e2, intType);
          break;
        case '&&':
        case '||':
          e1 = tryFixExpressionType(expression.e1, boolType);
          e2 = tryFixExpressionType(expression.e2, boolType);
          break;
        case '::':
          e1 = tryFixExpressionType(expression.e1, stringType);
          e2 = tryFixExpressionType(expression.e2, stringType);
          break;
        case '==':
        case '!=': {
          const t1 = getExpressionFixedType(expression.e1, null);
          const t2 = getExpressionFixedType(expression.e2, null);
          assert(
            isTheSameType(t1, t2),
            `Comparing non-equal types: ${prettyPrintType(t1)}, ${prettyPrintType(t2)}`
          );
          e1 = tryFixExpressionType(expression.e1, t1);
          e2 = tryFixExpressionType(expression.e2, t2);
          break;
        }
      }
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        e1,
        e2,
      };
    }
    case 'IfElseExpression':
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        boolExpression: tryFixExpressionType(expression.boolExpression, boolType),
        e1: tryFixExpressionType(expression.e1, expectedType),
        e2: tryFixExpressionType(expression.e2, expectedType),
      };
    case 'MatchExpression': {
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        matchedExpression: tryFixExpressionType(
          expression.matchedExpression,
          getExpressionFixedType(expression.matchedExpression, null) as IdentifierType
        ),
        matchingList: expression.matchingList.map((it) => ({
          ...it,
          expression: tryFixExpressionType(it.expression, expectedType),
        })),
      };
    }
    case 'LambdaExpression': {
      const newType = getExpressionFixedType(expression, null) as FunctionType;
      return {
        ...expression,
        type: newType,
        parameters: checkedZip(expression.parameters, newType.argumentTypes).map(
          ([[parameter, originalT], t]) => [parameter, typeFixItself(originalT, t)]
        ),
        captured: Object.fromEntries(
          Object.entries(expression.captured).map(([name, t]) => [name, typeFixItself(t, null)])
        ),
        body: tryFixExpressionType(expression.body, newType.returnType),
      };
    }
    case 'StatementBlockExpression': {
      const { block } = expression;
      assert(
        block.expression != null || isTheSameType(expectedType, unitType),
        `block.expression == null && expectedType == ${prettyPrintType(expectedType)}`
      );
      const fixedStatements = block.statements.map((statement) => {
        const fixedAssignedExpression = tryFixExpressionType(
          statement.assignedExpression,
          typeFixItself(statement.assignedExpression.type, null)
        );
        return {
          ...statement,
          typeAnnotation: fixedAssignedExpression.type,
          assignedExpression: fixedAssignedExpression,
        };
      });
      const fixedExpression =
        block.expression == null ? undefined : tryFixExpressionType(block.expression, expectedType);
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        block: { ...block, statements: fixedStatements, expression: fixedExpression },
      };
    }
  }
};

export default fixExpressionType;
