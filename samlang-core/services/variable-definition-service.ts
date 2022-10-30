import {
  Location,
  LocationCollections,
  ModuleReferenceCollections,
  Sources,
} from "../ast/common-nodes";
import { Pattern, SamlangExpression, SamlangModule, SourceId } from "../ast/samlang-nodes";
import { assert, error, LocalStackedContext } from "../utils";

export type DefinitionAndUses = {
  readonly definitionLocation: Location;
  readonly useLocations: readonly Location[];
};

class ScopedDefinitionManager extends LocalStackedContext<Location> {}

export class ModuleScopedVariableDefinitionLookup {
  /** Mapping from definition's range to all the uses' range. */
  private readonly definitionToUsesTable = LocationCollections.hashMapOf<Location[]>();
  /** Mapping from a use to its definition. Here for faster lookup. */
  private readonly useToDefinitionTable = LocationCollections.hashMapOf<Location>();

  constructor(samlangModule: SamlangModule) {
    samlangModule.classes.forEach((samlangClass) => {
      samlangClass.members.forEach((classMember) => {
        const manager = new ScopedDefinitionManager();
        classMember.parameters.forEach(({ name, nameLocation }) => {
          this.defineVariable(name, nameLocation, manager);
        });
        this.collectDefinitionAndUseWithDefinitionManager(classMember.body, manager);
      });
    });
  }

  public findAllDefinitionAndUses(location: Location): DefinitionAndUses | null {
    const definitionLocation = this.useToDefinitionTable.get(location) ?? location;
    const useLocations = this.definitionToUsesTable.get(definitionLocation);
    if (useLocations == null) return null;
    return { definitionLocation, useLocations };
  }

  private collectDefinitionAndUseWithDefinitionManager(
    expression: SamlangExpression,
    manager: ScopedDefinitionManager,
  ): void {
    switch (expression.__type__) {
      case "LiteralExpression":
      case "ThisExpression":
      case "ClassMemberExpression":
        return;
      case "VariableExpression":
        this.addDefinitionAndUse(manager.getLocalValueType(expression.name), expression.location);
        return;
      case "FieldAccessExpression":
      case "MethodAccessExpression":
      case "UnaryExpression":
        this.collectDefinitionAndUseWithDefinitionManager(expression.expression, manager);
        return;
      case "FunctionCallExpression":
        this.collectDefinitionAndUseWithDefinitionManager(expression.functionExpression, manager);
        expression.functionArguments.forEach((it) =>
          this.collectDefinitionAndUseWithDefinitionManager(it, manager),
        );
        return;
      case "BinaryExpression":
        this.collectDefinitionAndUseWithDefinitionManager(expression.e1, manager);
        this.collectDefinitionAndUseWithDefinitionManager(expression.e2, manager);
        return;
      case "IfElseExpression":
        this.collectDefinitionAndUseWithDefinitionManager(expression.boolExpression, manager);
        this.collectDefinitionAndUseWithDefinitionManager(expression.e1, manager);
        this.collectDefinitionAndUseWithDefinitionManager(expression.e2, manager);
        return;
      case "MatchExpression":
        this.collectDefinitionAndUseWithDefinitionManager(expression.matchedExpression, manager);
        expression.matchingList.forEach((matchItem) => {
          manager.withNestedScope(() => {
            if (matchItem.dataVariable != null) {
              const [{ name: variable, location }] = matchItem.dataVariable;
              this.defineVariable(variable, location, manager);
            }
            this.collectDefinitionAndUseWithDefinitionManager(matchItem.expression, manager);
          });
        });
        return;
      case "LambdaExpression":
        manager.withNestedScope(() => {
          expression.parameters.forEach(({ name: { name, location } }) =>
            this.defineVariable(name, location, manager),
          );
          this.collectDefinitionAndUseWithDefinitionManager(expression.body, manager);
        });
        return;
      case "StatementBlockExpression":
        manager.withNestedScope(() => {
          const { statements, expression: finalExpression } = expression.block;
          statements.forEach(({ pattern, assignedExpression }) => {
            this.collectDefinitionAndUseWithDefinitionManager(assignedExpression, manager);
            switch (pattern.type) {
              case "ObjectPattern":
                pattern.destructedNames.forEach((name) => {
                  if (name.alias == null) {
                    this.defineVariable(name.fieldName.name, name.fieldName.location, manager);
                  } else {
                    const { name: alias, location: aliasLocation } = name.alias;
                    this.defineVariable(alias, aliasLocation, manager);
                  }
                });
                return;
              case "VariablePattern":
                this.defineVariable(pattern.name, pattern.location, manager);
                return;
              case "WildCardPattern":
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

  private defineVariable(variable: string, location: Location, manager: ScopedDefinitionManager) {
    manager.addLocalValueType(variable, location, error);
    this.definitionToUsesTable.set(location, []);
  }

  private addDefinitionAndUse(definition: Location | undefined, use: Location) {
    if (definition == null) return;
    this.definitionToUsesTable.forceGet(definition).push(use);
    this.useToDefinitionTable.set(use, definition);
  }
}

export interface ReadonlyVariableDefinitionLookup {
  findAllDefinitionAndUses(location: Location): DefinitionAndUses | null;
}

export class VariableDefinitionLookup implements ReadonlyVariableDefinitionLookup {
  private readonly moduleTable =
    ModuleReferenceCollections.hashMapOf<ModuleScopedVariableDefinitionLookup>();

  rebuild(sources: Sources<SamlangModule>): void {
    this.moduleTable.clear();
    sources.forEach((samlangModule, moduleReference) => {
      this.moduleTable.set(
        moduleReference,
        new ModuleScopedVariableDefinitionLookup(samlangModule),
      );
    });
  }

  findAllDefinitionAndUses(location: Location): DefinitionAndUses | null {
    return (
      this.moduleTable.get(location.moduleReference)?.findAllDefinitionAndUses(location) ?? null
    );
  }
}

function getRelevantInRanges(
  location: Location,
  { definitionLocation, useLocations }: DefinitionAndUses,
) {
  const locations: Location[] = [];
  if (location.contains(definitionLocation)) locations.push(definitionLocation);
  locations.push(...useLocations.filter((it) => location.contains(it)));
  return locations;
}

function applyExpressionRenamingWithDefinitionAndUse(
  expression: SamlangExpression,
  definitionAndUses: DefinitionAndUses,
  newName: string,
): SamlangExpression {
  const relevantInRange = getRelevantInRanges(expression.location, definitionAndUses);
  if (relevantInRange.length === 0) return expression;
  assert(expression.__type__ !== "LiteralExpression");
  assert(expression.__type__ !== "ThisExpression");
  assert(expression.__type__ !== "ClassMemberExpression");
  switch (expression.__type__) {
    case "VariableExpression":
      return { ...expression, name: newName };
    case "FieldAccessExpression":
    case "MethodAccessExpression":
    case "UnaryExpression":
      return {
        ...expression,
        expression: applyExpressionRenamingWithDefinitionAndUse(
          expression.expression,
          definitionAndUses,
          newName,
        ),
      };
    case "FunctionCallExpression":
      return {
        ...expression,
        functionExpression: applyExpressionRenamingWithDefinitionAndUse(
          expression.functionExpression,
          definitionAndUses,
          newName,
        ),
        functionArguments: expression.functionArguments.map((it) =>
          applyExpressionRenamingWithDefinitionAndUse(it, definitionAndUses, newName),
        ),
      };
    case "BinaryExpression":
      return {
        ...expression,
        e1: applyExpressionRenamingWithDefinitionAndUse(expression.e1, definitionAndUses, newName),
        e2: applyExpressionRenamingWithDefinitionAndUse(expression.e2, definitionAndUses, newName),
      };
    case "IfElseExpression":
      return {
        ...expression,
        boolExpression: applyExpressionRenamingWithDefinitionAndUse(
          expression.boolExpression,
          definitionAndUses,
          newName,
        ),
        e1: applyExpressionRenamingWithDefinitionAndUse(expression.e1, definitionAndUses, newName),
        e2: applyExpressionRenamingWithDefinitionAndUse(expression.e2, definitionAndUses, newName),
      };
    case "MatchExpression":
      return {
        ...expression,
        matchedExpression: applyExpressionRenamingWithDefinitionAndUse(
          expression.matchedExpression,
          definitionAndUses,
          newName,
        ),
        matchingList: expression.matchingList.map((matchingItem) => {
          const rewrittenExpression = applyExpressionRenamingWithDefinitionAndUse(
            matchingItem.expression,
            definitionAndUses,
            newName,
          );
          if (matchingItem.dataVariable == null) {
            return {
              ...matchingItem,
              expression: rewrittenExpression,
            };
          }
          if (
            definitionAndUses.definitionLocation.toString() !==
            matchingItem.dataVariable[0].location.toString()
          ) {
            return {
              ...matchingItem,
              expression: rewrittenExpression,
            };
          }
          return {
            ...matchingItem,
            dataVariable: [SourceId(newName), matchingItem.dataVariable[1]],
            expression: rewrittenExpression,
          };
        }),
      };
    case "LambdaExpression":
      return {
        ...expression,
        parameters: expression.parameters.map(({ name, typeAnnotation }) => ({
          name:
            name.location.toString() === definitionAndUses.definitionLocation.toString()
              ? SourceId(newName)
              : name,
          typeAnnotation,
        })),
        body: applyExpressionRenamingWithDefinitionAndUse(
          expression.body,
          definitionAndUses,
          newName,
        ),
      };
    case "StatementBlockExpression":
      return {
        ...expression,
        block: {
          location: expression.block.location,
          statements: expression.block.statements.map((statement) => {
            const assignedExpression = applyExpressionRenamingWithDefinitionAndUse(
              statement.assignedExpression,
              definitionAndUses,
              newName,
            );
            let pattern: Pattern;
            switch (statement.pattern.type) {
              case "ObjectPattern":
                pattern = {
                  ...statement.pattern,
                  destructedNames: statement.pattern.destructedNames.map(
                    ({ fieldName, fieldOrder, type, alias, location }) => {
                      if (alias == null) {
                        if (
                          fieldName.location.toString() ===
                          definitionAndUses.definitionLocation.toString()
                        ) {
                          return {
                            fieldName,
                            fieldOrder,
                            type,
                            alias: SourceId(newName),
                            location,
                          };
                        }
                      } else {
                        if (
                          alias.location.toString() ===
                          definitionAndUses.definitionLocation.toString()
                        ) {
                          return {
                            fieldName,
                            fieldOrder,
                            type,
                            alias: SourceId(newName),
                            location,
                          };
                        }
                      }
                      return { fieldName, fieldOrder, type, alias, location };
                    },
                  ),
                };
                break;
              case "VariablePattern":
                pattern =
                  statement.pattern.location.toString() ===
                  definitionAndUses.definitionLocation.toString()
                    ? { ...statement.pattern, name: newName }
                    : statement.pattern;
                break;
              case "WildCardPattern":
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
                  newName,
                ),
        },
      };
  }
}

export const applyRenamingWithDefinitionAndUse = (
  samlangModule: SamlangModule,
  definitionAndUses: DefinitionAndUses,
  newName: string,
): SamlangModule => ({
  imports: samlangModule.imports,
  classes: samlangModule.classes.map((classDefinition) => ({
    ...classDefinition,
    members: classDefinition.members.map((member) => ({
      ...member,
      parameters: member.parameters.map((variable) =>
        variable.nameLocation.toString() === definitionAndUses.definitionLocation.toString()
          ? { ...variable, name: newName }
          : variable,
      ),
      body: applyExpressionRenamingWithDefinitionAndUse(member.body, definitionAndUses, newName),
    })),
  })),
  interfaces: samlangModule.interfaces,
});
