import {
  ObjectPatternDestucturedName,
  Pattern,
  SamlangExpression,
  SamlangType,
  SamlangValStatement,
  SourceExpressionVariable,
  SourceFieldType,
  SourceUnitType,
  StatementBlock,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, checkNotNull, ignore, LocalStackedContext, zip } from '../utils';
import type { AccessibleGlobalTypingContext } from './typing-context';

export default class StatementTypeChecker {
  constructor(
    private readonly accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private readonly errorCollector: ModuleErrorCollector,
    private readonly typeCheckExpression: (
      expression: SamlangExpression,
      expectedType: SamlangType
    ) => SamlangExpression
  ) {}

  readonly typeCheck = (
    { range, statements, expression }: StatementBlock,
    expectedType: SamlangType,
    localContext: LocalStackedContext<SamlangType>
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
          type: SourceUnitType,
          associatedComments: [],
          name: '_',
        }),
        expectedType
      );
      return { range, statements: checkedStatements };
    });

  private typeCheckValStatement(
    statement: SamlangValStatement,
    localContext: LocalStackedContext<SamlangType>
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
        ).map(([{ name }, elementType]) => {
          if (name != null) {
            localContext.addLocalValueType(name.name, elementType, ignore);
          }
          return { name, type: elementType };
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
          readonly fieldMappings: Readonly<Record<string, SourceFieldType>>;
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
          const { fieldName: originalName, alias: renamedName } = destructedName;
          const fieldInformation = fieldMappings[originalName.name];
          if (fieldInformation == null) {
            this.errorCollector.reportUnresolvedNameError(originalName.range, originalName.name);
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
            this.errorCollector.reportUnresolvedNameError(originalName.range, originalName.name);
            return {
              ...statement,
              typeAnnotation: assignedExpression.type,
              assignedExpression: checkedAssignedExpression,
            };
          }
          const nameToBeUsed = renamedName ?? originalName;
          localContext.addLocalValueType(nameToBeUsed.name, fieldType, ignore);
          const fieldOrder = checkNotNull(fieldOrderMapping[originalName.name]);
          destructedNames.push({ ...destructedName, type: fieldType, fieldOrder });
        }
        checkedPattern = { range, type: 'ObjectPattern', destructedNames };
        break;
      }

      case 'VariablePattern':
        localContext.addLocalValueType(pattern.name, checkedAssignedExpressionType, ignore);
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
