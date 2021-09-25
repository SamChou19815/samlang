import { Type, unitType } from 'samlang-core-ast/common-nodes';
import {
  SamlangExpression,
  Pattern,
  ObjectPatternDestucturedName,
  SamlangValStatement,
  StatementBlock,
  SourceExpressionVariable,
} from 'samlang-core-ast/samlang-nodes';
import type { FieldType } from 'samlang-core-ast/samlang-toplevel';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import { checkNotNull, zip, LocalStackedContext, assert } from 'samlang-core-utils';

import type { AccessibleGlobalTypingContext } from './typing-context';

export default class StatementTypeChecker {
  constructor(
    private readonly accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private readonly errorCollector: ModuleErrorCollector,
    private readonly typeCheckExpression: (
      expression: SamlangExpression,
      expectedType: Type
    ) => SamlangExpression
  ) {}

  readonly typeCheck = (
    { range, statements, expression }: StatementBlock,
    expectedType: Type,
    localContext: LocalStackedContext<Type>
  ): StatementBlock =>
    localContext.withNestedScope(() => {
      const checkedStatements = statements.map((statement) =>
        this.typeCheckValStatement(statement, localContext)
      );
      if (expression != null) {
        const checkedExpression = this.typeCheckExpression(expression, expectedType);
        return { range, statements: checkedStatements, expression: checkedExpression };
      }
      // Force the type checker to resolve expected type to unit.
      this.typeCheckExpression(
        SourceExpressionVariable({
          range,
          type: unitType,
          associatedComments: [],
          name: '_',
        }),
        expectedType
      );
      return { range, statements: checkedStatements };
    });

  private typeCheckValStatement(
    statement: SamlangValStatement,
    localContext: LocalStackedContext<Type>
  ): SamlangValStatement {
    const { range, pattern, typeAnnotation, assignedExpression } = statement;
    const checkedAssignedExpression = this.typeCheckExpression(assignedExpression, typeAnnotation);
    const checkedAssignedExpressionType = checkedAssignedExpression.type;
    let checkedPattern: Pattern;
    switch (pattern.type) {
      case 'TuplePattern': {
        if (checkedAssignedExpressionType.type !== 'TupleType') {
          this.errorCollector.reportUnexpectedTypeKindError(
            assignedExpression.range,
            'tuple',
            checkedAssignedExpressionType
          );
          return {
            ...statement,
            typeAnnotation: assignedExpression.type,
            assignedExpression: checkedAssignedExpression,
          };
        }
        const expectedSize = checkedAssignedExpressionType.mappings.length;
        const actualSize = pattern.destructedNames.length;
        if (expectedSize !== actualSize) {
          this.errorCollector.reportTupleSizeMismatchError(
            assignedExpression.range,
            expectedSize,
            actualSize
          );
        }
        const checkedDestructedNames = zip(
          pattern.destructedNames,
          checkedAssignedExpressionType.mappings
        ).map(([{ name, range: nameRange }, elementType]) => {
          if (name != null) {
            localContext.addLocalValueType(name, elementType, () =>
              this.errorCollector.reportCollisionError(nameRange, name)
            );
          }
          return { name, type: elementType, range: nameRange };
        });
        checkedPattern = { ...pattern, destructedNames: checkedDestructedNames };
        break;
      }

      case 'ObjectPattern': {
        if (checkedAssignedExpressionType.type !== 'IdentifierType') {
          this.errorCollector.reportUnexpectedTypeKindError(
            assignedExpression.range,
            'identifier',
            checkedAssignedExpressionType
          );
          return {
            ...statement,
            typeAnnotation: assignedExpression.type,
            assignedExpression: checkedAssignedExpression,
          };
        }
        const fieldMappingsOrError = this.accessibleGlobalTypingContext.resolveTypeDefinition(
          checkedAssignedExpressionType,
          'object'
        );
        let fieldNamesMappings: {
          readonly fieldNames: readonly string[];
          readonly fieldMappings: Readonly<Record<string, FieldType>>;
        };
        assert(
          fieldMappingsOrError.type !== 'IllegalOtherClassMatch',
          'We match on objects here, so this case is impossible.'
        );
        switch (fieldMappingsOrError.type) {
          case 'Resolved':
            fieldNamesMappings = {
              fieldNames: fieldMappingsOrError.names,
              fieldMappings: fieldMappingsOrError.mappings,
            };
            break;
          case 'UnsupportedClassTypeDefinition':
            this.errorCollector.reportUnsupportedClassTypeDefinitionError(
              assignedExpression.range,
              'object'
            );
            return {
              ...statement,
              typeAnnotation: assignedExpression.type,
              assignedExpression: checkedAssignedExpression,
            };
        }
        const { fieldNames, fieldMappings } = fieldNamesMappings;
        const fieldOrderMapping = Object.fromEntries(
          fieldNames.map((name, index) => [name, index])
        );
        const destructedNames: ObjectPatternDestucturedName[] = [];
        for (let i = 0; i < pattern.destructedNames.length; i += 1) {
          const destructedName: ObjectPatternDestucturedName = checkNotNull(
            pattern.destructedNames[i]
          );
          const { fieldName: originalName, alias: renamedName, range: fieldRange } = destructedName;
          const fieldInformation = fieldMappings[originalName];
          if (fieldInformation == null) {
            this.errorCollector.reportUnresolvedNameError(fieldRange, originalName);
            return {
              ...statement,
              typeAnnotation: assignedExpression.type,
              assignedExpression: checkedAssignedExpression,
            };
          }
          const { isPublic, type: fieldType } = fieldInformation;
          if (
            checkedAssignedExpressionType.identifier !==
              this.accessibleGlobalTypingContext.currentClass &&
            !isPublic
          ) {
            this.errorCollector.reportUnresolvedNameError(fieldRange, originalName);
            return {
              ...statement,
              typeAnnotation: assignedExpression.type,
              assignedExpression: checkedAssignedExpression,
            };
          }
          const nameToBeUsed = renamedName?.[0] ?? originalName;
          localContext.addLocalValueType(nameToBeUsed, fieldType, () =>
            this.errorCollector.reportCollisionError(fieldRange, nameToBeUsed)
          );
          const fieldOrder = checkNotNull(fieldOrderMapping[originalName]);
          destructedNames.push({ ...destructedName, type: fieldType, fieldOrder });
        }
        checkedPattern = { range, type: 'ObjectPattern', destructedNames };
        break;
      }

      case 'VariablePattern':
        localContext.addLocalValueType(pattern.name, checkedAssignedExpressionType, () =>
          this.errorCollector.reportCollisionError(pattern.range, pattern.name)
        );
        checkedPattern = pattern;
        break;

      case 'WildCardPattern':
        checkedPattern = pattern;
        break;
    }
    return {
      ...statement,
      typeAnnotation: assignedExpression.type,
      assignedExpression: checkedAssignedExpression,
      pattern: checkedPattern,
    };
  }
}
