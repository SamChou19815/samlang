import { Location, LocationCollections } from '../ast/common-nodes';
import type {
  SamlangExpression,
  SamlangModule,
  SamlangType,
  SourceClassMemberDeclaration,
  SourceIdentifier,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { checkNotNull, LocalStackedContext, ReadonlyHashMap, ReadonlyHashSet } from '../utils';

type SimplifiedSourceIdentifier = Omit<SourceIdentifier, 'associatedComments'>;

class SsaBuilder extends LocalStackedContext<Location> {
  unboundNames = new Set<string>();
  invalidDefines = LocationCollections.hashSetOf();
  definitionToUsesMap = LocationCollections.hashMapOf<Location[]>();
  useDefineMap = LocationCollections.hashMapOf<Location>();
  lambdaCaptures = LocationCollections.hashMapOf<ReadonlyMap<string, Location>>();

  constructor(private readonly errorReporter?: GlobalErrorReporter) {
    super();
  }

  define = ({ name, location }: SimplifiedSourceIdentifier) =>
    this.addLocalValueType(name, location, () => {
      if (!this.invalidDefines.has(location)) {
        // Never error on an illegal define twice, since they might be visited multiple times.
        this.errorReporter?.reportCollisionError(location, name);
      }
      this.invalidDefines.add(location);
    });

  defineAll = (ids: readonly SimplifiedSourceIdentifier[]) => ids.forEach(this.define);

  use = ({ name, location }: SimplifiedSourceIdentifier) => {
    const definition = this.getLocalValueType(name);
    if (definition == null) {
      this.unboundNames.add(name);
      this.errorReporter?.reportUnresolvedNameError(location, name);
    } else {
      this.useDefineMap.set(location, definition);
      const uses = this.definitionToUsesMap.get(definition);
      if (uses == null) {
        this.definitionToUsesMap.set(definition, [location]);
      } else {
        uses.push(location);
      }
    }
  };

  visitToplevel(samlangModule: SamlangModule): void {
    samlangModule.imports.forEach((oneImport) => this.defineAll(oneImport.importedMembers));

    const interfaces: SourceInterfaceDeclaration[] = [
      ...samlangModule.interfaces,
      ...samlangModule.classes,
    ];
    // Hoist class names
    interfaces.forEach(({ name }) => this.define(name));

    interfaces.forEach((interfaceDeclaration) => {
      const typeDefinition = interfaceDeclaration.typeDefinition;

      this.withNestedScope(() => {
        this.withNestedScope(() => {
          this.defineAll(interfaceDeclaration.typeParameters.map((it) => it.name));
          interfaceDeclaration.typeParameters.forEach(({ bound }) => {
            if (bound != null) this.visitType(bound);
          });
          interfaceDeclaration.extendsOrImplementsNodes.forEach(this.visitType);

          if (typeDefinition != null) {
            this.defineAll(typeDefinition.names);
            typeDefinition.names.forEach((it) =>
              this.visitType(checkNotNull(typeDefinition.mappings.get(it.name)).type),
            );
          }
        });

        // Pull member names into another scope for conflict test,
        // as they cannot be referenced by name without class prefix.
        this.withNestedScope(() =>
          interfaceDeclaration.members.map(({ name }) => this.define(name)),
        );
        this.withNestedScope(() => {
          if (typeDefinition != null) {
            this.define({ name: 'this', location: interfaceDeclaration.location });
          }
          this.defineAll(interfaceDeclaration.typeParameters.map((it) => it.name));
          this.visitMembers(interfaceDeclaration.members.filter((it) => it.isMethod));
        });
        this.withNestedScope(() => {
          this.visitMembers(interfaceDeclaration.members.filter((it) => !it.isMethod));
        });
      });
    });
  }

  private visitMembers(members: readonly SourceClassMemberDeclaration[]): void {
    members.forEach((member) => {
      this.withNestedScope(() => {
        this.defineAll(member.typeParameters.map((it) => it.name));
        member.typeParameters.forEach(({ bound }) => {
          if (bound != null) this.visitType(bound);
        });
        member.parameters.forEach(({ name, nameLocation: location, type }) => {
          this.define({ name, location });
          this.visitType(type);
        });
        this.visitType(member.type.returnType);
        if (member.body != null) {
          this.visitExpression(member.body);
        }
      });
    });
  }

  visitExpression = (expression: SamlangExpression): void => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return;
      case 'ClassMemberExpression':
        expression.typeArguments.forEach(this.visitType);
        return;
      case 'ThisExpression':
        this.use({ name: 'this', location: expression.location });
        return;
      case 'VariableExpression':
        this.use({ name: expression.name, location: expression.location });
        return;
      case 'FieldAccessExpression':
      case 'MethodAccessExpression':
        this.visitExpression(expression.expression);
        expression.typeArguments.forEach(this.visitType);
        return;
      case 'UnaryExpression':
        this.visitExpression(expression.expression);
        return;
      case 'FunctionCallExpression':
        this.visitExpression(expression.functionExpression);
        expression.functionArguments.forEach(this.visitExpression);
        return;
      case 'BinaryExpression':
        this.visitExpression(expression.e1);
        this.visitExpression(expression.e2);
        return;
      case 'IfElseExpression':
        this.visitExpression(expression.boolExpression);
        this.visitExpression(expression.e1);
        this.visitExpression(expression.e2);
        return;
      case 'MatchExpression':
        this.visitExpression(expression.matchedExpression);
        expression.matchingList.forEach((matchItem) => {
          this.withNestedScope(() => {
            if (matchItem.dataVariable != null) {
              const [id] = matchItem.dataVariable;
              this.define(id);
            }
            this.visitExpression(matchItem.expression);
          });
        });
        return;
      case 'LambdaExpression': {
        const [, captured] = this.withNestedScopeReturnCaptured(() => {
          expression.parameters.forEach(({ name, typeAnnotation }) => {
            this.define(name);
            if (typeAnnotation != null) this.visitType(typeAnnotation);
          });
          this.visitExpression(expression.body);
        });
        this.lambdaCaptures.set(expression.location, captured);
        return;
      }
      case 'StatementBlockExpression':
        this.withNestedScope(() => {
          const { statements, expression: finalExpression } = expression.block;
          statements.forEach(({ pattern, typeAnnotation, assignedExpression }) => {
            this.visitExpression(assignedExpression);
            if (typeAnnotation != null) this.visitType(typeAnnotation);
            switch (pattern.type) {
              case 'ObjectPattern':
                pattern.destructedNames.forEach((name) =>
                  this.define(name.alias ?? name.fieldName),
                );
                return;
              case 'VariablePattern':
                this.define(pattern);
                return;
              case 'WildCardPattern':
                return;
            }
          });
          if (finalExpression != null) {
            this.visitExpression(finalExpression);
          }
        });
        return;
    }
  };

  visitType = (type: SamlangType) => {
    switch (type.__type__) {
      case 'PrimitiveType':
        return;
      case 'IdentifierType':
        this.use({ name: type.identifier, location: type.reason.useLocation });
        type.typeArguments.forEach(this.visitType);
        return;
      case 'FunctionType':
        type.argumentTypes.forEach(this.visitType);
        this.visitType(type.returnType);
        return;
    }
  };
}

export interface SsaAnalysisResult {
  readonly unboundNames: ReadonlySet<string>;
  readonly invalidDefines: ReadonlyHashSet<Location>;
  readonly definitionToUsesMap: ReadonlyHashMap<Location, readonly Location[]>;
  readonly useDefineMap: ReadonlyHashMap<Location, Location>;
  readonly lambdaCaptures: ReadonlyHashMap<Location, ReadonlyMap<string, Location>>;
}

export function performSSAAnalysisOnSamlangExpression(
  expression: SamlangExpression,
  errorReporter?: GlobalErrorReporter,
): SsaAnalysisResult {
  const builder = new SsaBuilder(errorReporter);
  builder.visitExpression(expression);
  return {
    unboundNames: builder.unboundNames,
    invalidDefines: builder.invalidDefines,
    definitionToUsesMap: builder.definitionToUsesMap,
    useDefineMap: builder.useDefineMap,
    lambdaCaptures: builder.lambdaCaptures,
  };
}

export default function performSSAAnalysisOnSamlangModule(
  samlangModule: SamlangModule,
  errorReporter?: GlobalErrorReporter,
): SsaAnalysisResult {
  const builder = new SsaBuilder(errorReporter);
  builder.visitToplevel(samlangModule);
  return {
    unboundNames: builder.unboundNames,
    invalidDefines: builder.invalidDefines,
    definitionToUsesMap: builder.definitionToUsesMap,
    useDefineMap: builder.useDefineMap,
    lambdaCaptures: builder.lambdaCaptures,
  };
}
