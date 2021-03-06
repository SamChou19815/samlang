import type { ModuleReference, Type } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import type { HashSet } from 'samlang-core-utils';

export const collectModuleReferenceFromType = (
  type: Type,
  collector: HashSet<ModuleReference>
): void => {
  switch (type.type) {
    case 'PrimitiveType':
    case 'UndecidedType':
      return;
    case 'IdentifierType':
      collector.add(type.moduleReference);
      type.typeArguments.forEach((it) => collectModuleReferenceFromType(it, collector));
      return;
    case 'TupleType':
      type.mappings.forEach((it) => collectModuleReferenceFromType(it, collector));
      return;
    case 'FunctionType':
      type.argumentTypes.forEach((it) => collectModuleReferenceFromType(it, collector));
      collectModuleReferenceFromType(type.returnType, collector);
      return;
  }
};

export const collectModuleReferenceFromExpression = (
  expression: SamlangExpression,
  collector: HashSet<ModuleReference>
): void => {
  collectModuleReferenceFromType(expression.type, collector);
  switch (expression.__type__) {
    case 'LiteralExpression':
    case 'ThisExpression':
    case 'VariableExpression':
      return;
    case 'ClassMemberExpression':
      collector.add(expression.moduleReference);
      return;
    case 'TupleConstructorExpression':
      expression.expressions.forEach((it) => collectModuleReferenceFromExpression(it, collector));
      return;
    case 'ObjectConstructorExpression':
      expression.fieldDeclarations.forEach((it) => {
        collectModuleReferenceFromType(it.type, collector);
        if (it.expression != null) {
          collectModuleReferenceFromExpression(it.expression, collector);
        }
      });
      return;
    case 'VariantConstructorExpression':
      collectModuleReferenceFromExpression(expression.data, collector);
      return;
    case 'FieldAccessExpression':
    case 'MethodAccessExpression':
    case 'UnaryExpression':
    case 'PanicExpression':
      collectModuleReferenceFromExpression(expression.expression, collector);
      return;
    case 'BuiltInFunctionCallExpression':
      collectModuleReferenceFromExpression(expression.argumentExpression, collector);
      return;
    case 'FunctionCallExpression':
      collectModuleReferenceFromExpression(expression.functionExpression, collector);
      expression.functionArguments.forEach((it) =>
        collectModuleReferenceFromExpression(it, collector)
      );
      return;
    case 'BinaryExpression':
      collectModuleReferenceFromExpression(expression.e1, collector);
      collectModuleReferenceFromExpression(expression.e2, collector);
      return;
    case 'IfElseExpression':
      collectModuleReferenceFromExpression(expression.boolExpression, collector);
      collectModuleReferenceFromExpression(expression.e1, collector);
      collectModuleReferenceFromExpression(expression.e2, collector);
      return;
    case 'MatchExpression':
      collectModuleReferenceFromExpression(expression.matchedExpression, collector);
      expression.matchingList.forEach((it) =>
        collectModuleReferenceFromExpression(it.expression, collector)
      );
      return;
    case 'LambdaExpression':
      expression.parameters.forEach(([, type]) => collectModuleReferenceFromType(type, collector));
      collectModuleReferenceFromExpression(expression.body, collector);
      return;
    case 'StatementBlockExpression': {
      const {
        block: { expression: finalExpression },
      } = expression;
      expression.block.statements.forEach((statement) => {
        collectModuleReferenceFromType(statement.typeAnnotation, collector);
        collectModuleReferenceFromExpression(statement.assignedExpression, collector);
      });
      if (finalExpression != null) {
        collectModuleReferenceFromExpression(finalExpression, collector);
      }
      return;
    }
  }
};
