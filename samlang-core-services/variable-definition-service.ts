import type { Range } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import type { ClassMemberDefinition } from 'samlang-core-ast/samlang-toplevel';
import { HashMap, LocalStackedContext, checkNotNull, error, hashMapOf } from 'samlang-core-utils';

export type DefinitionAndUses = {
  readonly definitionRange: Range;
  readonly useRanges: readonly Range[];
};

class ScopedDefinitionManager extends LocalStackedContext<Range> {}

export class VariableDefinitionLookup {
  /** Mapping from definition's range to all the uses' range. */
  private readonly definitionToUsesTable: HashMap<Range, Range[]> = hashMapOf();
  /** Mapping from a use to its definition. Here for faster lookup. */
  private readonly useToDefinitionTable: HashMap<Range, Range> = hashMapOf();

  constructor(classMember: ClassMemberDefinition) {
    const manager = new ScopedDefinitionManager();
    classMember.parameters.forEach(({ name, nameRange }) => {
      this.defineVariable(name, nameRange, manager);
    });
    this.collectDefinitionAndUseWithDefinitionManager(classMember.body, manager);
  }

  public findAllDefinitionAndUses(range: Range): DefinitionAndUses | null {
    const definitionRange = this.useToDefinitionTable.get(range) ?? range;
    const useRanges = this.definitionToUsesTable.get(definitionRange);
    if (useRanges == null) return null;
    return { definitionRange, useRanges };
  }

  private collectDefinitionAndUseWithDefinitionManager(
    expression: SamlangExpression,
    manager: ScopedDefinitionManager
  ): void {
    switch (expression.__type__) {
      case 'LiteralExpression':
      case 'ThisExpression':
      case 'ClassMemberExpression':
        return;
      case 'VariableExpression':
        this.addDefinitionAndUse(
          checkNotNull(manager.getLocalValueType(expression.name)),
          expression.range
        );
        return;
      case 'TupleConstructorExpression':
        expression.expressions.map((it) =>
          this.collectDefinitionAndUseWithDefinitionManager(it, manager)
        );
        return;
      case 'ObjectConstructorExpression':
        expression.fieldDeclarations.forEach((fieldDeclaration) => {
          if (fieldDeclaration.expression == null) {
            this.addDefinitionAndUse(
              checkNotNull(manager.getLocalValueType(fieldDeclaration.name)),
              fieldDeclaration.nameRange
            );
          } else {
            this.collectDefinitionAndUseWithDefinitionManager(fieldDeclaration.expression, manager);
          }
        });
        return;
      case 'VariantConstructorExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.data, manager);
        return;
      case 'FieldAccessExpression':
      case 'MethodAccessExpression':
      case 'UnaryExpression':
      case 'PanicExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.expression, manager);
        return;
      case 'BuiltInFunctionCallExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.argumentExpression, manager);
        return;
      case 'FunctionCallExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.functionExpression, manager);
        expression.functionArguments.forEach((it) =>
          this.collectDefinitionAndUseWithDefinitionManager(it, manager)
        );
        return;
      case 'BinaryExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.e1, manager);
        this.collectDefinitionAndUseWithDefinitionManager(expression.e2, manager);
        return;
      case 'IfElseExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.boolExpression, manager);
        this.collectDefinitionAndUseWithDefinitionManager(expression.e1, manager);
        this.collectDefinitionAndUseWithDefinitionManager(expression.e2, manager);
        return;
      case 'MatchExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.matchedExpression, manager);
        expression.matchingList.forEach((matchItem) => {
          manager.withNestedScope(() => {
            if (matchItem.dataVariable != null) {
              const [variable, range] = matchItem.dataVariable;
              this.defineVariable(variable, range, manager);
            }
            this.collectDefinitionAndUseWithDefinitionManager(matchItem.expression, manager);
          });
        });
        return;
      case 'LambdaExpression':
        // TODO: record location for parameters
        manager.withNestedScope(() => {
          expression.parameters.forEach(([name, range]) =>
            this.defineVariable(name, range, manager)
          );
          this.collectDefinitionAndUseWithDefinitionManager(expression.body, manager);
        });
        return;
      case 'StatementBlockExpression':
        manager.withNestedScope(() => {
          const { statements, expression: finalExpression } = expression.block;
          statements.forEach(({ pattern, assignedExpression }) => {
            this.collectDefinitionAndUseWithDefinitionManager(assignedExpression, manager);
            switch (pattern.type) {
              case 'TuplePattern':
                pattern.destructedNames.forEach(({ name, range }) => {
                  if (name != null) this.defineVariable(name, range, manager);
                });
                return;
              case 'ObjectPattern':
                pattern.destructedNames.forEach((name) => {
                  if (name.alias == null) {
                    this.defineVariable(name.fieldName, name.fieldNameRange, manager);
                  } else {
                    const [alias, aliasRange] = name.alias;
                    this.defineVariable(alias, aliasRange, manager);
                  }
                });
                return;
              case 'VariablePattern':
                this.defineVariable(pattern.name, pattern.range, manager);
                return;
              case 'WildCardPattern':
                return;
            }
          });
          if (finalExpression != null) {
            this.collectDefinitionAndUseWithDefinitionManager(finalExpression, manager);
          }
        });
        return;
    }
  }

  private defineVariable(variable: string, range: Range, manager: ScopedDefinitionManager) {
    manager.addLocalValueType(variable, range, error);
    this.definitionToUsesTable.set(range, []);
  }

  private addDefinitionAndUse(definition: Range, use: Range) {
    this.definitionToUsesTable.forceGet(definition).push(use);
    this.useToDefinitionTable.set(use, definition);
  }
}
