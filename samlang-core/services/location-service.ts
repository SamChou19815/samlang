import {
  Location,
  LocationCollections,
  ModuleReference,
  ModuleReferenceCollections,
  moduleReferenceToString,
  Position,
  SourceReason,
} from '../ast/common-nodes';
import {
  SamlangExpression,
  SamlangModule,
  SourceExpressionVariable,
  SourceIdentifierType,
} from '../ast/samlang-nodes';
import type { HashMap } from '../utils';

export interface ReadOnlyLocationLookup<E> {
  get(moduleReference: ModuleReference, position: Position): E | null;
}

export class LocationLookup<E> implements ReadOnlyLocationLookup<E> {
  /** Mapping from module reference to a list of (entity, position range of entity) */
  private readonly locationTable = ModuleReferenceCollections.hashMapOf<HashMap<Location, E>>();

  get(moduleReference: ModuleReference, position: Position): E | null {
    const location = this.getBestLocation(moduleReference, position);
    if (location == null) return null;
    const localTable = this.locationTable.forceGet(location.moduleReference);
    const entity = localTable.forceGet(location);
    return entity;
  }

  set(location: Location, entity: E): void {
    const localMap = this.locationTable.get(location.moduleReference);
    if (localMap == null) {
      this.locationTable.set(
        location.moduleReference,
        LocationCollections.hashMapOf([location, entity])
      );
    } else {
      localMap.set(location, entity);
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
    fileLocationMap.entries().forEach(([location]) => {
      // Weight calculation is adapted from the heuristics in
      // https://github.com/facebook/pyre-check/blob/master/analysis/lookup.ml
      if (!location.containsPosition(position)) return;
      const weight =
        (location.end.line - location.start.line) * 1000 +
        (location.end.character - location.start.character);
      if (weight < bestWeight) {
        bestWeight = weight;
        bestLocation = location;
      }
    });
    return bestLocation;
  }
}

export class SamlangExpressionLocationLookupBuilder {
  constructor(public readonly locationLookup: LocationLookup<SamlangExpression>) {}

  rebuild(moduleReference: ModuleReference, { classes }: SamlangModule): void {
    this.locationLookup.purge(moduleReference);
    classes.forEach(({ name, members }) => {
      this.buildSingleExpression(
        SourceExpressionVariable({
          location: name.location,
          type: SourceIdentifierType(
            SourceReason(name.location, name.location),
            moduleReference,
            `class ${moduleReferenceToString(moduleReference)}.${name.name}`
          ),
          name: name.name,
        })
      );
      members.forEach((member) => {
        this.buildSingleExpression(
          SourceExpressionVariable({
            location: member.name.location,
            type: member.type,
            name: member.name.name,
          })
        );
        this.buildRecursively(member.body);
      });
    });
  }

  private buildRecursively(expression: SamlangExpression) {
    switch (expression.__type__) {
      case 'LiteralExpression':
      case 'VariableExpression':
      case 'ThisExpression':
        this.buildSingleExpression(expression);
        return;
      case 'ClassMemberExpression': {
        const {
          moduleReference: modRef,
          className: { name: className, location: classNameLocation },
        } = expression;
        this.buildSingleExpression(
          SourceExpressionVariable({
            location: classNameLocation,
            type: SourceIdentifierType(
              SourceReason(classNameLocation, classNameLocation),
              classNameLocation.moduleReference,
              `class ${moduleReferenceToString(modRef)}.${className}`
            ),
            name: className,
          })
        );
        this.buildSingleExpression(expression);
        return;
      }
      case 'FieldAccessExpression':
      case 'MethodAccessExpression':
      case 'UnaryExpression':
        this.buildRecursively(expression.expression);
        this.buildSingleExpression(expression);
        return;
      case 'FunctionCallExpression':
        this.buildRecursively(expression.functionExpression);
        expression.functionArguments.forEach((it) => this.buildRecursively(it));
        this.buildSingleExpression(expression);
        return;
      case 'BinaryExpression':
        this.buildRecursively(expression.e1);
        this.buildRecursively(expression.e2);
        this.buildSingleExpression(expression);
        return;
      case 'IfElseExpression':
        this.buildRecursively(expression.boolExpression);
        this.buildRecursively(expression.e1);
        this.buildRecursively(expression.e2);
        this.buildSingleExpression(expression);
        return;
      case 'MatchExpression':
        this.buildRecursively(expression.matchedExpression);
        expression.matchingList.forEach((it) => this.buildRecursively(it.expression));
        this.buildSingleExpression(expression);
        return;
      case 'LambdaExpression':
        this.buildRecursively(expression.body);
        this.buildSingleExpression(expression);
        return;
      case 'StatementBlockExpression':
        expression.block.statements.forEach(({ assignedExpression, pattern }) => {
          this.buildRecursively(assignedExpression);
          const assignedExpressionType = assignedExpression.type;
          switch (pattern.type) {
            case 'ObjectPattern':
              return;
            case 'VariablePattern':
              this.buildSingleExpression(
                SourceExpressionVariable({
                  location: pattern.location,
                  name: pattern.name,
                  type: assignedExpressionType,
                })
              );
              return;
            case 'WildCardPattern':
              this.buildSingleExpression(
                SourceExpressionVariable({
                  location: pattern.location,
                  name: '_',
                  type: assignedExpressionType,
                })
              );
          }
        });
        if (expression.block.expression != null) {
          this.buildRecursively(expression.block.expression);
        }
    }
  }

  private buildSingleExpression(expression: SamlangExpression) {
    this.locationLookup.set(expression.location, expression);
  }
}
