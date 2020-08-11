import type ModuleReference from '../ast/common/module-reference';
import type Position from '../ast/common/position';
import type Range from '../ast/common/range';
import type { Location } from '../ast/common/structs';
import { identifierType, TupleType } from '../ast/common/types';
import { SamlangExpression, EXPRESSION_VARIABLE } from '../ast/lang/samlang-expressions';
import type { SamlangModule } from '../ast/lang/samlang-toplevel';
import { HashMap, hashMapOf } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';

export interface ReadOnlyLocationLookup<E> {
  get(moduleReference: ModuleReference, position: Position): E | null;
}

export class LocationLookup<E> implements ReadOnlyLocationLookup<E> {
  /** Mapping from module reference to a list of (entity, position range of entity) */
  private readonly locationTable: HashMap<ModuleReference, HashMap<Range, E>> = hashMapOf();

  get(moduleReference: ModuleReference, position: Position): E | null {
    const location = this.getBestLocation(moduleReference, position);
    if (location == null) return null;
    const localTable = this.locationTable.get(location.moduleReference);
    assertNotNull(localTable);
    const entity = localTable.get(location.range);
    assertNotNull(entity);
    return entity;
  }

  set(location: Location, entity: E): void {
    const localMap = this.locationTable.get(location.moduleReference);
    if (localMap == null) {
      this.locationTable.set(location.moduleReference, hashMapOf([location.range, entity]));
    } else {
      localMap.set(location.range, entity);
    }
  }

  purge(moduleReference: ModuleReference): void {
    this.locationTable.delete(moduleReference);
  }

  /**
   * Visible for testing.
   *
   * @returns the narrowest possible location correspond to given [position] at [moduleReference]. If there is no
   * location that contains the given position, `null` is returned.
   */
  getBestLocation(moduleReference: ModuleReference, position: Position): Location | null {
    const fileLocationMap = this.locationTable.get(moduleReference);
    if (fileLocationMap == null) return null;
    let bestWeight = Number.MAX_SAFE_INTEGER;
    let bestLocation: Location | null = null;
    fileLocationMap.entries().forEach(([range]) => {
      // Weight calculation is adapted from the heuristics in
      // https://github.com/facebook/pyre-check/blob/master/analysis/lookup.ml
      if (!range.containsPosition(position)) return;
      const weight =
        (range.end.line - range.start.line) * 1000 + (range.end.column - range.start.column);
      if (weight < bestWeight) {
        bestWeight = weight;
        bestLocation = { moduleReference, range };
      }
    });
    return bestLocation;
  }
}

export class SamlangExpressionLocationLookupBuilder {
  constructor(public readonly locationLookup: LocationLookup<SamlangExpression>) {}

  rebuild(moduleReference: ModuleReference, { classes }: SamlangModule): void {
    this.locationLookup.purge(moduleReference);
    classes.forEach(({ name, nameRange, members }) => {
      this.buildSingleExpression(
        moduleReference,
        EXPRESSION_VARIABLE({ range: nameRange, type: identifierType(`class ${name}`), name })
      );
      members.forEach((member) => {
        this.buildSingleExpression(
          moduleReference,
          EXPRESSION_VARIABLE({ range: member.nameRange, type: member.type, name: member.name })
        );
        this.buildRecursively(moduleReference, member.body);
      });
    });
  }

  private buildRecursively(moduleReference: ModuleReference, expression: SamlangExpression) {
    switch (expression.__type__) {
      case 'LiteralExpression':
      case 'VariableExpression':
      case 'ThisExpression':
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'ClassMemberExpression': {
        const { className, classNameRange } = expression;
        this.buildSingleExpression(
          moduleReference,
          EXPRESSION_VARIABLE({
            range: classNameRange,
            type: identifierType(`class ${className}`),
            name: className,
          })
        );
        this.buildSingleExpression(moduleReference, expression);
        return;
      }
      case 'TupleConstructorExpression':
        expression.expressions.forEach((it) => this.buildRecursively(moduleReference, it));
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'ObjectConstructorExpression':
        expression.fieldDeclarations.forEach((fieldDeclaration) =>
          this.buildRecursively(
            moduleReference,
            fieldDeclaration.expression != null
              ? fieldDeclaration.expression
              : EXPRESSION_VARIABLE({
                  range: fieldDeclaration.range,
                  type: fieldDeclaration.type,
                  name: fieldDeclaration.name,
                })
          )
        );
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'VariantConstructorExpression':
        this.buildRecursively(moduleReference, expression.data);
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'FieldAccessExpression':
      case 'MethodAccessExpression':
      case 'UnaryExpression':
      case 'PanicExpression':
        this.buildRecursively(moduleReference, expression.expression);
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'BuiltInFunctionCallExpression':
        this.buildRecursively(moduleReference, expression.argumentExpression);
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'FunctionCallExpression':
        this.buildRecursively(moduleReference, expression.functionExpression);
        expression.functionArguments.forEach((it) => this.buildRecursively(moduleReference, it));
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'BinaryExpression':
        this.buildRecursively(moduleReference, expression.e1);
        this.buildRecursively(moduleReference, expression.e2);
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'IfElseExpression':
        this.buildRecursively(moduleReference, expression.boolExpression);
        this.buildRecursively(moduleReference, expression.e1);
        this.buildRecursively(moduleReference, expression.e2);
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'MatchExpression':
        this.buildRecursively(moduleReference, expression.matchedExpression);
        expression.matchingList.forEach((it) =>
          this.buildRecursively(moduleReference, it.expression)
        );
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'LambdaExpression':
        this.buildRecursively(moduleReference, expression.body);
        this.buildSingleExpression(moduleReference, expression);
        return;
      case 'StatementBlockExpression':
        expression.block.statements.forEach(({ assignedExpression, pattern }) => {
          this.buildRecursively(moduleReference, assignedExpression);
          const assignedExpressionType = assignedExpression.type;
          switch (pattern.type) {
            case 'TuplePattern': {
              const assignedTupleTypeMappings = (assignedExpressionType as TupleType).mappings;
              pattern.destructedNames.forEach(([name, range], index) => {
                const type = assignedTupleTypeMappings[index];
                this.buildSingleExpression(
                  moduleReference,
                  EXPRESSION_VARIABLE({ range, name: name ?? '_', type })
                );
              });
              return;
            }
            case 'ObjectPattern':
              return;
            case 'VariablePattern':
              this.buildSingleExpression(
                moduleReference,
                EXPRESSION_VARIABLE({
                  range: pattern.range,
                  name: pattern.name,
                  type: assignedExpressionType,
                })
              );
              return;
            case 'WildCardPattern':
              this.buildSingleExpression(
                moduleReference,
                EXPRESSION_VARIABLE({
                  range: pattern.range,
                  name: '_',
                  type: assignedExpressionType,
                })
              );
          }
        });
        if (expression.block.expression != null) {
          this.buildRecursively(moduleReference, expression.block.expression);
        }
    }
  }

  private buildSingleExpression(moduleReference: ModuleReference, expression: SamlangExpression) {
    this.locationLookup.set({ moduleReference, range: expression.range }, expression);
  }
}
