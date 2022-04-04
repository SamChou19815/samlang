import { DummySourceReason, SourceReason } from '../ast/common-nodes';
import {
  isTheSameType,
  prettyPrintType,
  SamlangExpression,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangTupleType,
  SamlangType,
  SourceBoolType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../ast/samlang-nodes';
import { assert, zip } from '../utils';
import type { ReadOnlyTypeResolution } from './type-resolution';
import resolveType from './type-resolver';

function checkedZip<E1, E2>(
  list1: readonly E1[],
  list2: readonly E2[]
): readonly (readonly [E1, E2])[] {
  assert(list1.length === list2.length, 'Slack type checker!');
  return zip(list1, list2);
}

export default function fixExpressionType(
  expression: SamlangExpression,
  expectedType: SamlangType,
  resolution: ReadOnlyTypeResolution
): SamlangExpression {
  function typeFixItself(type: SamlangType, expected: SamlangType | null): SamlangType {
    const resolvedPotentiallyUndecidedType = resolution.resolveType(type);
    const resolvedType = resolveType(resolvedPotentiallyUndecidedType, () =>
      SourceUnitType(DummySourceReason)
    );
    const resolvedTypePrettyPrinted = prettyPrintType(resolvedType);
    assert(resolvedType.type !== 'UndecidedType', `Bad type: ${resolvedTypePrettyPrinted}`);
    if (expected === null) return resolvedType;
    assert(
      isTheSameType(expected, resolvedType),
      `resolvedType(${resolvedTypePrettyPrinted}) should be consistent with expectedType(${prettyPrintType(
        expected
      )})!`
    );
    return resolvedType;
  }

  const getExpressionFixedType = (e: SamlangExpression, t: SamlangType | null): SamlangType =>
    typeFixItself(e.type, t);

  const tryFixExpressionType = (e: SamlangExpression, t: SamlangType): SamlangExpression =>
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
      const newType = typeFixItself(expression.type, expectedType) as SamlangTupleType;
      return {
        ...expression,
        type: newType,
        expressions: checkedZip(expression.expressions, newType.mappings).map(([element, type]) =>
          tryFixExpressionType(element, type)
        ),
      };
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
          fixedExpression = tryFixExpressionType(
            expression.expression,
            SourceBoolType(DummySourceReason)
          );
          break;
        case '-':
          fixedExpression = tryFixExpressionType(
            expression.expression,
            SourceIntType(DummySourceReason)
          );
          break;
      }
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        expression: fixedExpression,
      };
    }
    case 'FunctionCallExpression': {
      const functionFixedType = getExpressionFixedType(
        expression.functionExpression,
        null
      ) as SamlangFunctionType;
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
          e1 = tryFixExpressionType(
            expression.e1,
            SourceIntType(SourceReason(expression.e1.location, null))
          );
          e2 = tryFixExpressionType(
            expression.e2,
            SourceIntType(SourceReason(expression.e2.location, null))
          );
          break;
        case '&&':
        case '||':
          e1 = tryFixExpressionType(
            expression.e1,
            SourceBoolType(SourceReason(expression.e1.location, null))
          );
          e2 = tryFixExpressionType(
            expression.e2,
            SourceBoolType(SourceReason(expression.e2.location, null))
          );
          break;
        case '::':
          e1 = tryFixExpressionType(
            expression.e1,
            SourceStringType(SourceReason(expression.e1.location, null))
          );
          e2 = tryFixExpressionType(
            expression.e2,
            SourceStringType(SourceReason(expression.e2.location, null))
          );
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
        boolExpression: tryFixExpressionType(
          expression.boolExpression,
          SourceBoolType(SourceReason(expression.boolExpression.location, null))
        ),
        e1: tryFixExpressionType(expression.e1, expectedType),
        e2: tryFixExpressionType(expression.e2, expectedType),
      };
    case 'MatchExpression': {
      return {
        ...expression,
        type: getExpressionFixedType(expression, expectedType),
        matchedExpression: tryFixExpressionType(
          expression.matchedExpression,
          getExpressionFixedType(expression.matchedExpression, null) as SamlangIdentifierType
        ),
        matchingList: expression.matchingList.map(
          ({ location, tag, tagOrder, dataVariable, expression: body }) => ({
            location,
            tag,
            tagOrder,
            dataVariable:
              dataVariable != null
                ? [dataVariable[0], typeFixItself(dataVariable[1], null)]
                : undefined,
            expression: tryFixExpressionType(body, expectedType),
          })
        ),
      };
    }
    case 'LambdaExpression': {
      const newType = getExpressionFixedType(expression, expectedType) as SamlangFunctionType;
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
        block.expression != null || isTheSameType(expectedType, SourceUnitType(DummySourceReason)),
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
}
