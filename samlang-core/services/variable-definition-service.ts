import type { ModuleReference, Range, Sources } from '../ast/common-nodes';
import type { Pattern, SamlangExpression, SamlangModule } from '../ast/samlang-nodes';
import { assert, error, HashMap, hashMapOf, LocalStackedContext } from '../utils';

export type DefinitionAndUses = {
  readonly definitionRange: Range;
  readonly useRanges: readonly Range[];
};

class ScopedDefinitionManager extends LocalStackedContext<Range> {}

export class ModuleScopedVariableDefinitionLookup {
  /** Mapping from definition's range to all the uses' range. */
  private readonly definitionToUsesTable: HashMap<Range, Range[]> = hashMapOf();
  /** Mapping from a use to its definition. Here for faster lookup. */
  private readonly useToDefinitionTable: HashMap<Range, Range> = hashMapOf();

  constructor(samlangModule: SamlangModule) {
    samlangModule.classes.forEach((samlangClass) => {
      samlangClass.members.forEach((classMember) => {
        const manager = new ScopedDefinitionManager();
        classMember.parameters.forEach(({ name, nameRange }) => {
          this.defineVariable(name, nameRange, manager);
        });
        this.collectDefinitionAndUseWithDefinitionManager(classMember.body, manager);
      });
    });
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
        this.addDefinitionAndUse(manager.getLocalValueType(expression.name), expression.range);
        return;
      case 'TupleConstructorExpression':
        expression.expressions.map((it) =>
          this.collectDefinitionAndUseWithDefinitionManager(it, manager)
        );
        return;
      case 'FieldAccessExpression':
      case 'MethodAccessExpression':
      case 'UnaryExpression':
        this.collectDefinitionAndUseWithDefinitionManager(expression.expression, manager);
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

  private addDefinitionAndUse(definition: Range | undefined, use: Range) {
    if (definition == null) return;
    this.definitionToUsesTable.forceGet(definition).push(use);
    this.useToDefinitionTable.set(use, definition);
  }
}

export interface ReadonlyVariableDefinitionLookup {
  findAllDefinitionAndUses(
    moduleReference: ModuleReference,
    range: Range
  ): DefinitionAndUses | null;
}

export class VariableDefinitionLookup implements ReadonlyVariableDefinitionLookup {
  private readonly moduleTable: HashMap<ModuleReference, ModuleScopedVariableDefinitionLookup> =
    hashMapOf();

  rebuild(sources: Sources<SamlangModule>): void {
    this.moduleTable.clear();
    sources.forEach((samlangModule, moduleReference) => {
      this.moduleTable.set(
        moduleReference,
        new ModuleScopedVariableDefinitionLookup(samlangModule)
      );
    });
  }

  findAllDefinitionAndUses(
    moduleReference: ModuleReference,
    range: Range
  ): DefinitionAndUses | null {
    return this.moduleTable.get(moduleReference)?.findAllDefinitionAndUses(range) ?? null;
  }
}

function getRelevantInRanges(range: Range, { definitionRange, useRanges }: DefinitionAndUses) {
  const ranges: Range[] = [];
  if (range.containsRange(definitionRange)) ranges.push(definitionRange);
  ranges.push(...useRanges.filter((it) => range.containsRange(it)));
  return ranges;
}

function applyExpressionRenamingWithDefinitionAndUse(
  expression: SamlangExpression,
  definitionAndUses: DefinitionAndUses,
  newName: string
): SamlangExpression {
  const relevantInRange = getRelevantInRanges(expression.range, definitionAndUses);
  if (relevantInRange.length === 0) return expression;
  assert(expression.__type__ !== 'LiteralExpression');
  assert(expression.__type__ !== 'ThisExpression');
  assert(expression.__type__ !== 'ClassMemberExpression');
  switch (expression.__type__) {
    case 'VariableExpression':
      return { ...expression, name: newName };
    case 'TupleConstructorExpression':
      return {
        ...expression,
        expressions: expression.expressions.map((it) =>
          applyExpressionRenamingWithDefinitionAndUse(it, definitionAndUses, newName)
        ),
      };
    case 'FieldAccessExpression':
    case 'MethodAccessExpression':
    case 'UnaryExpression':
      return {
        ...expression,
        expression: applyExpressionRenamingWithDefinitionAndUse(
          expression.expression,
          definitionAndUses,
          newName
        ),
      };
    case 'FunctionCallExpression':
      return {
        ...expression,
        functionExpression: applyExpressionRenamingWithDefinitionAndUse(
          expression.functionExpression,
          definitionAndUses,
          newName
        ),
        functionArguments: expression.functionArguments.map((it) =>
          applyExpressionRenamingWithDefinitionAndUse(it, definitionAndUses, newName)
        ),
      };
    case 'BinaryExpression':
      return {
        ...expression,
        e1: applyExpressionRenamingWithDefinitionAndUse(expression.e1, definitionAndUses, newName),
        e2: applyExpressionRenamingWithDefinitionAndUse(expression.e2, definitionAndUses, newName),
      };
    case 'IfElseExpression':
      return {
        ...expression,
        boolExpression: applyExpressionRenamingWithDefinitionAndUse(
          expression.boolExpression,
          definitionAndUses,
          newName
        ),
        e1: applyExpressionRenamingWithDefinitionAndUse(expression.e1, definitionAndUses, newName),
        e2: applyExpressionRenamingWithDefinitionAndUse(expression.e2, definitionAndUses, newName),
      };
    case 'MatchExpression':
      return {
        ...expression,
        matchedExpression: applyExpressionRenamingWithDefinitionAndUse(
          expression.matchedExpression,
          definitionAndUses,
          newName
        ),
        matchingList: expression.matchingList.map((matchingItem) => {
          const rewrittenExpression = applyExpressionRenamingWithDefinitionAndUse(
            matchingItem.expression,
            definitionAndUses,
            newName
          );
          if (matchingItem.dataVariable == null) {
            return {
              ...matchingItem,
              expression: rewrittenExpression,
            };
          }
          if (
            definitionAndUses.definitionRange.toString() !== matchingItem.dataVariable[1].toString()
          ) {
            return {
              ...matchingItem,
              expression: rewrittenExpression,
            };
          }
          return {
            ...matchingItem,
            dataVariable: [newName, matchingItem.dataVariable[1], matchingItem.dataVariable[2]],
            expression: rewrittenExpression,
          };
        }),
      };
    case 'LambdaExpression':
      return {
        ...expression,
        parameters: expression.parameters.map(([parameterName, parameterRange, parameterType]) => [
          parameterRange.toString() === definitionAndUses.definitionRange.toString()
            ? newName
            : parameterName,
          parameterRange,
          parameterType,
        ]),
        body: applyExpressionRenamingWithDefinitionAndUse(
          expression.body,
          definitionAndUses,
          newName
        ),
      };
    case 'StatementBlockExpression':
      return {
        ...expression,
        block: {
          range: expression.block.range,
          statements: expression.block.statements.map((statement) => {
            const assignedExpression = applyExpressionRenamingWithDefinitionAndUse(
              statement.assignedExpression,
              definitionAndUses,
              newName
            );
            let pattern: Pattern;
            switch (statement.pattern.type) {
              case 'TuplePattern':
                pattern = {
                  ...statement.pattern,
                  destructedNames: statement.pattern.destructedNames.map(
                    ({ name, type, range }) => ({
                      name:
                        name == null
                          ? undefined
                          : range.toString() === definitionAndUses.definitionRange.toString()
                          ? newName
                          : name,
                      type,
                      range,
                    })
                  ),
                };
                break;
              case 'ObjectPattern':
                pattern = {
                  ...statement.pattern,
                  destructedNames: statement.pattern.destructedNames.map(
                    ({ fieldName, fieldNameRange, fieldOrder, type, alias, range }) => {
                      if (alias == null) {
                        if (
                          fieldNameRange.toString() === definitionAndUses.definitionRange.toString()
                        ) {
                          return {
                            fieldName,
                            fieldNameRange,
                            fieldOrder,
                            type,
                            alias: [newName, fieldNameRange] as const,
                            range,
                          };
                        }
                      } else {
                        if (alias[1].toString() === definitionAndUses.definitionRange.toString()) {
                          return {
                            fieldName,
                            fieldNameRange,
                            fieldOrder,
                            type,
                            alias: [newName, alias[1]] as const,
                            range,
                          };
                        }
                      }
                      return { fieldName, fieldNameRange, fieldOrder, type, alias, range };
                    }
                  ),
                };
                break;
              case 'VariablePattern':
                pattern =
                  statement.pattern.range.toString() ===
                  definitionAndUses.definitionRange.toString()
                    ? { ...statement.pattern, name: newName }
                    : statement.pattern;
                break;
              case 'WildCardPattern':
                pattern = statement.pattern;
                break;
            }
            return {
              ...statement,
              pattern,
              assignedExpression,
            };
          }),
          expression:
            expression.block.expression == null
              ? undefined
              : applyExpressionRenamingWithDefinitionAndUse(
                  expression.block.expression,
                  definitionAndUses,
                  newName
                ),
        },
      };
  }
}

export const applyRenamingWithDefinitionAndUse = (
  samlangModule: SamlangModule,
  definitionAndUses: DefinitionAndUses,
  newName: string
): SamlangModule => ({
  imports: samlangModule.imports,
  classes: samlangModule.classes.map((classDefinition) => ({
    ...classDefinition,
    members: classDefinition.members.map((member) => ({
      ...member,
      parameters: member.parameters.map((variable) =>
        variable.nameRange.toString() === definitionAndUses.definitionRange.toString()
          ? { ...variable, name: newName }
          : variable
      ),
      body: applyExpressionRenamingWithDefinitionAndUse(member.body, definitionAndUses, newName),
    })),
  })),
});
