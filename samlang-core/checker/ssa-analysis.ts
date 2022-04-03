import { Range, RangeCollections } from '../ast/common-nodes';
import type {
  SamlangExpression,
  SamlangModule,
  SamlangType,
  SourceIdentifier,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { checkNotNull, LocalStackedContext, ReadonlyHashMap, ReadonlyHashSet } from '../utils';

type SimplifiedSourceIdentifier = Omit<SourceIdentifier, 'associatedComments'>;

class SsaBuilder extends LocalStackedContext<Range> {
  unboundNames = new Set<string>();
  invalidDefines = RangeCollections.hashSetOf();
  definitionToUsesMap = RangeCollections.hashMapOf<Range[]>();
  useDefineMap = RangeCollections.hashMapOf<Range>();
  lambdaCaptures = RangeCollections.hashMapOf<ReadonlyMap<string, Range>>();

  constructor(private readonly errorCollector?: ModuleErrorCollector) {
    super();
  }

  define = ({ name, range }: SimplifiedSourceIdentifier) =>
    this.addLocalValueType(name, range, () => {
      if (!this.invalidDefines.has(range)) {
        // Never error on an illegal define twice, since they might be visited multiple times.
        this.errorCollector?.reportCollisionError(range, name);
      }
      this.invalidDefines.add(range);
    });

  defineAll = (ids: readonly SimplifiedSourceIdentifier[]) => ids.forEach(this.define);

  use = ({ name, range }: SimplifiedSourceIdentifier) => {
    const definition = this.getLocalValueType(name);
    if (definition == null) {
      this.unboundNames.add(name);
      this.errorCollector?.reportUnresolvedNameError(range, name);
    } else {
      this.useDefineMap.set(range, definition);
      const uses = this.definitionToUsesMap.get(definition);
      if (uses == null) {
        this.definitionToUsesMap.set(definition, [range]);
      } else {
        uses.push(range);
      }
    }
  };

  visitToplevel(samlangModule: SamlangModule) {
    samlangModule.imports.forEach((oneImport) => this.defineAll(oneImport.importedMembers));

    const interfaces: SourceInterfaceDeclaration[] = [
      ...samlangModule.interfaces,
      ...samlangModule.classes,
    ];
    // Hoist class names
    interfaces.forEach(({ name }) => this.define(name));

    interfaces.forEach((interfaceDeclaration) => {
      this.withNestedScope(() => {
        const typeDefinition = interfaceDeclaration.typeDefinition;
        if (typeDefinition != null) {
          this.withNestedScope(() => {
            this.defineAll(interfaceDeclaration.typeParameters);
            this.defineAll(typeDefinition.names);
            typeDefinition.names.forEach((it) =>
              this.visitType(checkNotNull(typeDefinition.mappings[it.name]).type)
            );
          });
        }

        // Pull member names into another scope for conflict test,
        // as they cannot be referenced by name without class prefix.
        this.withNestedScope(() =>
          interfaceDeclaration.members.map(({ name }) => this.define(name))
        );
        interfaceDeclaration.members.map((member) => {
          this.withNestedScope(() => {
            if (member.isMethod) this.defineAll(interfaceDeclaration.typeParameters);
            this.defineAll(member.typeParameters);
            member.parameters.forEach(({ name, nameRange: range, type }) => {
              this.define({ name, range });
              this.visitType(type);
            });
            this.visitType(member.type.returnType);
            if (member.body != null) {
              this.visitExpression(member.body);
            }
          });
        });
      });
    });
  }

  visitExpression = (expression: SamlangExpression) => {
    switch (expression.__type__) {
      case 'LiteralExpression':
      case 'ThisExpression':
      case 'ClassMemberExpression':
        return;
      case 'VariableExpression':
        this.use({ name: expression.name, range: expression.range });
        return;
      case 'TupleConstructorExpression':
        expression.expressions.forEach(this.visitExpression);
        return;
      case 'FieldAccessExpression':
      case 'MethodAccessExpression':
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
          expression.parameters.forEach(([id, type]) => {
            this.define(id);
            this.visitType(type);
          });
          this.visitExpression(expression.body);
        });
        this.lambdaCaptures.set(expression.range, captured);
        return;
      }
      case 'StatementBlockExpression':
        this.withNestedScope(() => {
          const { statements, expression: finalExpression } = expression.block;
          statements.forEach(({ pattern, assignedExpression }) => {
            this.visitExpression(assignedExpression);
            switch (pattern.type) {
              case 'TuplePattern':
                pattern.destructedNames.forEach(({ name }) => {
                  if (name != null) this.define(name);
                });
                return;
              case 'ObjectPattern':
                pattern.destructedNames.forEach((name) =>
                  this.define(name.alias ?? name.fieldName)
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
    switch (type.type) {
      case 'PrimitiveType':
        return;
      case 'IdentifierType':
        this.use({ name: type.identifier, range: type.reason.definitionLocation });
        type.typeArguments.forEach(this.visitType);
        return;
      case 'TupleType':
        type.mappings.forEach(this.visitType);
        return;
      case 'FunctionType':
        type.argumentTypes.forEach(this.visitType);
        this.visitType(type.returnType);
        return;
      case 'UndecidedType':
        return;
    }
  };
}

export interface SsaAnalysisResult {
  readonly unboundNames: ReadonlySet<string>;
  readonly invalidDefines: ReadonlyHashSet<Range>;
  readonly definitionToUsesMap: ReadonlyHashMap<Range, readonly Range[]>;
  readonly useDefineMap: ReadonlyHashMap<Range, Range>;
  readonly lambdaCaptures: ReadonlyHashMap<Range, ReadonlyMap<string, Range>>;
}

export function performSSAAnalysisOnSamlangExpression(
  expression: SamlangExpression,
  errorCollector?: ModuleErrorCollector
): SsaAnalysisResult {
  const builder = new SsaBuilder(errorCollector);
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
  errorCollector?: ModuleErrorCollector
): SsaAnalysisResult {
  const builder = new SsaBuilder(errorCollector);
  builder.visitToplevel(samlangModule);
  return {
    unboundNames: builder.unboundNames,
    invalidDefines: builder.invalidDefines,
    definitionToUsesMap: builder.definitionToUsesMap,
    useDefineMap: builder.useDefineMap,
    lambdaCaptures: builder.lambdaCaptures,
  };
}
