import { SourceReason } from '../ast/common-nodes';
import {
  BinaryExpression,
  ClassMemberExpression,
  FieldAccessExpression,
  FunctionCallExpression,
  IfElseExpression,
  LambdaExpression,
  LiteralExpression,
  MatchExpression,
  MethodAccessExpression,
  ObjectPatternDestucturedName,
  Pattern,
  prettyPrintType,
  SamlangExpression,
  SamlangType,
  SamlangValStatement,
  SourceBoolType,
  SourceExpressionClassMember,
  SourceExpressionFieldAccess,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionMethodAccess,
  SourceExpressionStatementBlock,
  SourceExpressionThis,
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceFieldType,
  SourceFunctionType,
  SourceIdentifier,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
  SourceUnknownType,
  StatementBlockExpression,
  ThisExpression,
  UnaryExpression,
  VariableExpression,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, checkNotNull, filterMap, zip } from '../utils';
import contextualTypeMeet from './contextual-type-meet';
import typeCheckFunctionCall from './function-call-type-checker';
import { solveTypeConstraints } from './type-constraints-solver';
import performTypeSubstitution from './type-substitution';
import type {
  AccessibleGlobalTypingContext,
  LocationBasedLocalTypingContext,
} from './typing-context';

class ExpressionTypeChecker {
  constructor(
    private readonly accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private readonly localTypingContext: LocationBasedLocalTypingContext,
    public readonly errorCollector: ModuleErrorCollector
  ) {}

  readonly typeCheck = (
    expression: SamlangExpression,
    hint: SamlangType | null
  ): SamlangExpression => {
    assert(
      expression.__type__ !== 'MethodAccessExpression',
      'Raw parsed expression does not contain this!'
    );
    switch (expression.__type__) {
      case 'LiteralExpression':
        return this.typeCheckLiteral(expression, hint);
      case 'ThisExpression':
        return this.typeCheckThis(expression, hint);
      case 'VariableExpression':
        return this.typeCheckVariable(expression, hint);
      case 'ClassMemberExpression':
        return this.typeCheckClassMember(expression, hint);
      case 'FieldAccessExpression':
        return this.typeCheckFieldAccess(expression, hint);
      case 'UnaryExpression':
        return this.typeCheckUnary(expression, hint);
      case 'FunctionCallExpression':
        return this.typeCheckFunctionCall(expression, hint);
      case 'BinaryExpression':
        return this.typeCheckBinary(expression, hint);
      case 'IfElseExpression':
        return this.typeCheckIfElse(expression, hint);
      case 'MatchExpression':
        return this.typeCheckMatch(expression, hint);
      case 'LambdaExpression':
        return this.typeCheckLambda(expression, hint);
      case 'StatementBlockExpression':
        return this.typeCheckStatementBlock(expression, hint);
    }
  };

  private readonly typeMeet = (general: SamlangType | null, specific: SamlangType): SamlangType =>
    general == null ? specific : contextualTypeMeet(general, specific, this.errorCollector);

  private readonly bestEffortUnknownType = (
    general: SamlangType | null,
    expression: SamlangExpression
  ): SamlangType =>
    this.typeMeet(general, SourceUnknownType(SourceReason(expression.location, null)));

  private typeCheckLiteral(
    expression: LiteralExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    this.typeMeet(hint, expression.type);
    // Literals are already well typed if it passed the previous check.
    return expression;
  }

  private typeCheckThis(expression: ThisExpression, hint: SamlangType | null): SamlangExpression {
    const typeFromContext = this.localTypingContext.getThisType();
    let type: SamlangType;
    if (typeFromContext == null) {
      this.errorCollector.reportIllegalThisError(expression.location);
      type = this.bestEffortUnknownType(hint, expression);
    } else {
      type = this.typeMeet(hint, typeFromContext);
    }
    return SourceExpressionThis({
      location: expression.location,
      type,
      associatedComments: expression.associatedComments,
    });
  }

  private typeCheckVariable(
    expression: VariableExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    return SourceExpressionVariable({
      location: expression.location,
      type: this.typeMeet(hint, this.localTypingContext.read(expression.location)),
      associatedComments: expression.associatedComments,
      name: expression.name,
    });
  }

  private typeCheckClassMemberWithPotentiallyUnresolvedTypeParameters(
    expression: ClassMemberExpression,
    hint: SamlangType | null
  ): {
    partiallyCheckedExpression: ClassMemberExpression;
    unsolvedTypeParameters: readonly string[];
  } {
    let classFunctionTypeInformation = this.accessibleGlobalTypingContext.getClassFunctionType(
      expression.moduleReference,
      expression.className.name,
      expression.memberName.name
    );
    if (classFunctionTypeInformation == null) {
      this.errorCollector.reportUnresolvedNameError(
        expression.location,
        `${expression.className.name}.${expression.memberName.name}`
      );
      const partiallyCheckedExpression = SourceExpressionClassMember({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        typeArguments: expression.typeArguments,
        moduleReference: expression.moduleReference,
        className: expression.className,
        memberName: expression.memberName,
      });
      return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
    }
    classFunctionTypeInformation = {
      ...classFunctionTypeInformation,
      type: {
        ...classFunctionTypeInformation.type,
        reason: SourceReason(expression.location, null),
      },
    };
    if (expression.typeArguments.length !== 0) {
      if (expression.typeArguments.length === classFunctionTypeInformation.typeParameters.length) {
        const type = this.typeMeet(
          hint,
          performTypeSubstitution(
            classFunctionTypeInformation.type,
            Object.fromEntries(
              zip(classFunctionTypeInformation.typeParameters, expression.typeArguments)
            )
          )
        );
        const partiallyCheckedExpression = SourceExpressionClassMember({
          location: expression.location,
          type,
          associatedComments: expression.associatedComments,
          typeArguments: expression.typeArguments,
          moduleReference: expression.moduleReference,
          className: expression.className,
          memberName: expression.memberName,
        });
        return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
      }
      this.errorCollector.reportArityMismatchError(
        expression.location,
        'type arguments',
        classFunctionTypeInformation.typeParameters.length,
        expression.typeArguments.length
      );
    } else if (classFunctionTypeInformation.typeParameters.length === 0) {
      // No type parameter to solve
      const partiallyCheckedExpression = SourceExpressionClassMember({
        location: expression.location,
        type: this.typeMeet(hint, classFunctionTypeInformation.type),
        associatedComments: expression.associatedComments,
        typeArguments: expression.typeArguments,
        moduleReference: expression.moduleReference,
        className: expression.className,
        memberName: expression.memberName,
      });
      return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
    }
    // Now we know we have some type parameters that cannot be locally resolved.
    if (hint != null) {
      // We either rely on hints.
      if (hint.type === 'FunctionType') {
        if (hint.argumentTypes.length === classFunctionTypeInformation.type.argumentTypes.length) {
          // Hint matches the shape and can be useful.
          const { solvedGenericType } = solveTypeConstraints(
            hint,
            classFunctionTypeInformation.type,
            classFunctionTypeInformation.typeParameters,
            this.errorCollector
          );
          const partiallyCheckedExpression = SourceExpressionClassMember({
            location: expression.location,
            type: solvedGenericType,
            associatedComments: expression.associatedComments,
            typeArguments: expression.typeArguments,
            moduleReference: expression.moduleReference,
            className: expression.className,
            memberName: expression.memberName,
          });
          return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
        }
        this.errorCollector.reportArityMismatchError(
          expression.location,
          'parameter',
          hint.argumentTypes.length,
          classFunctionTypeInformation.type.argumentTypes.length
        );
      } else {
        this.errorCollector.reportUnexpectedTypeKindError(
          expression.location,
          prettyPrintType(hint),
          'function'
        );
      }
    }
    // When hint is bad or there is no hint, we need to give up and let context help us more.
    const partiallyCheckedExpression = SourceExpressionClassMember({
      location: expression.location,
      type: {
        ...classFunctionTypeInformation.type,
        reason: SourceReason(
          expression.location,
          classFunctionTypeInformation.type.reason.definitionLocation
        ),
      },
      associatedComments: expression.associatedComments,
      typeArguments: expression.typeArguments,
      moduleReference: expression.moduleReference,
      className: expression.className,
      memberName: expression.memberName,
    });
    return {
      partiallyCheckedExpression,
      unsolvedTypeParameters: classFunctionTypeInformation.typeParameters,
    };
  }

  private replaceUndecidedTypeParameterWithUnknownAndUpdateType(
    expression: SamlangExpression,
    unsolvedTypeParameters: readonly string[],
    hint: SamlangType | null
  ): SamlangExpression {
    if (unsolvedTypeParameters.length !== 0) {
      this.errorCollector.reportInsufficientTypeInferenceContextError(expression.location);
    }
    const type = this.typeMeet(
      hint,
      performTypeSubstitution(
        expression.type,
        Object.fromEntries(
          zip(
            unsolvedTypeParameters,
            unsolvedTypeParameters.map(() => this.bestEffortUnknownType(null, expression))
          )
        )
      )
    );
    return { ...expression, type } as SamlangExpression;
  }

  private typeCheckClassMember(
    expression: ClassMemberExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    const { partiallyCheckedExpression, unsolvedTypeParameters } =
      this.typeCheckClassMemberWithPotentiallyUnresolvedTypeParameters(expression, hint);
    return this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
      partiallyCheckedExpression,
      unsolvedTypeParameters,
      hint
    );
  }

  private typeCheckFieldOrMethodAccessWithPotentiallyUnresolvedTypeParameters(
    expression: FieldAccessExpression,
    hint: SamlangType | null
  ): {
    partiallyCheckedExpression: FieldAccessExpression | MethodAccessExpression;
    unsolvedTypeParameters: readonly string[];
  } {
    const checkedExpression = this.typeCheck(expression.expression, null);
    if (checkedExpression.type.type !== 'IdentifierType') {
      this.errorCollector.reportUnexpectedTypeKindError(
        checkedExpression.location,
        'identifier',
        checkedExpression.type
      );
      const partiallyCheckedExpression = SourceExpressionFieldAccess({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        expression: checkedExpression,
        fieldName: expression.fieldName,
        fieldOrder: expression.fieldOrder,
      });
      return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
    }
    let methodTypeInformation = this.accessibleGlobalTypingContext.getClassMethodPolymorphicType(
      checkedExpression.type.moduleReference,
      checkedExpression.type.identifier,
      expression.fieldName.name,
      checkedExpression.type.typeArguments
    );
    if (methodTypeInformation != null) {
      methodTypeInformation = {
        ...methodTypeInformation,
        type: {
          ...methodTypeInformation.type,
          reason: SourceReason(
            expression.location,
            methodTypeInformation.type.reason.definitionLocation
          ),
        },
      };
      // This is a valid method. We will now type check it as a method access
      if (methodTypeInformation.typeParameters.length === 0) {
        // No type parameter to solve
        const partiallyCheckedExpression = SourceExpressionMethodAccess({
          location: expression.location,
          type: this.typeMeet(hint, methodTypeInformation.type),
          associatedComments: expression.associatedComments,
          expression: checkedExpression,
          methodName: expression.fieldName,
        });
        return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
      }
      // Now we know we have some type parameters that cannot be locally resolved.
      if (hint != null) {
        // We either rely on hints.
        if (hint.type === 'FunctionType') {
          if (hint.argumentTypes.length === methodTypeInformation.type.argumentTypes.length) {
            // Hint matches the shape and can be useful.
            const { solvedGenericType } = solveTypeConstraints(
              hint,
              methodTypeInformation.type,
              methodTypeInformation.typeParameters,
              this.errorCollector
            );
            const partiallyCheckedExpression = SourceExpressionMethodAccess({
              location: expression.location,
              type: solvedGenericType,
              associatedComments: expression.associatedComments,
              expression: checkedExpression,
              methodName: expression.fieldName,
            });
            return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
          }
          this.errorCollector.reportArityMismatchError(
            expression.location,
            'parameter',
            hint.argumentTypes.length,
            methodTypeInformation.type.argumentTypes.length
          );
        } else {
          this.errorCollector.reportUnexpectedTypeKindError(
            expression.location,
            prettyPrintType(hint),
            'function'
          );
        }
      }
      // When hint is bad or there is no hint, we need to give up and let context help us more.
      const partiallyCheckedExpression = SourceExpressionMethodAccess({
        location: expression.location,
        type: methodTypeInformation.type,
        associatedComments: expression.associatedComments,
        expression: checkedExpression,
        methodName: expression.fieldName,
      });
      return {
        partiallyCheckedExpression,
        unsolvedTypeParameters: methodTypeInformation.typeParameters,
      };
    } else {
      const fieldMappingsOrError = this.accessibleGlobalTypingContext.resolveTypeDefinition(
        checkedExpression.type,
        'object'
      );
      assert(fieldMappingsOrError.type !== 'IllegalOtherClassMatch', 'Impossible!');
      if (fieldMappingsOrError.type === 'UnsupportedClassTypeDefinition') {
        this.errorCollector.reportUnsupportedClassTypeDefinitionError(
          checkedExpression.location,
          'object'
        );
        const partiallyCheckedExpression = SourceExpressionFieldAccess({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          expression: checkedExpression,
          fieldName: expression.fieldName,
          fieldOrder: expression.fieldOrder,
        });
        return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
      }
      const fieldNames = fieldMappingsOrError.names;
      const fieldMappings = fieldMappingsOrError.mappings;
      const fieldType = fieldMappings[expression.fieldName.name];
      if (fieldType == null) {
        this.errorCollector.reportUnresolvedNameError(
          expression.fieldName.location,
          expression.fieldName.name
        );
        const partiallyCheckedExpression = SourceExpressionFieldAccess({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          expression: checkedExpression,
          fieldName: expression.fieldName,
          fieldOrder: expression.fieldOrder,
        });
        return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
      }
      if (
        checkedExpression.type.identifier !== this.accessibleGlobalTypingContext.currentClass &&
        !fieldType.isPublic
      ) {
        this.errorCollector.reportUnresolvedNameError(
          expression.fieldName.location,
          expression.fieldName.name
        );
        const partiallyCheckedExpression = SourceExpressionFieldAccess({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          expression: checkedExpression,
          fieldName: expression.fieldName,
          fieldOrder: expression.fieldOrder,
        });
        return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
      }
      const order = fieldNames.findIndex((name) => name === expression.fieldName.name);
      assert(order !== -1, `Bad field: ${expression.fieldName}`);
      const partiallyCheckedExpression = SourceExpressionFieldAccess({
        location: expression.location,
        type: this.typeMeet(hint, {
          ...fieldType.type,
          reason: SourceReason(expression.location, fieldType.type.reason.definitionLocation),
        }),
        associatedComments: expression.associatedComments,
        expression: checkedExpression,
        fieldName: expression.fieldName,
        fieldOrder: order,
      });
      return { partiallyCheckedExpression, unsolvedTypeParameters: [] };
    }
  }

  private typeCheckFieldAccess(
    expression: FieldAccessExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    const { partiallyCheckedExpression, unsolvedTypeParameters } =
      this.typeCheckFieldOrMethodAccessWithPotentiallyUnresolvedTypeParameters(expression, hint);
    if (partiallyCheckedExpression.__type__ === 'FieldAccessExpression') {
      return partiallyCheckedExpression;
    }
    return this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
      partiallyCheckedExpression,
      unsolvedTypeParameters,
      hint
    );
  }

  private typeCheckUnary(expression: UnaryExpression, hint: SamlangType | null): SamlangExpression {
    // Type of unary expression can be decided at parse time.
    this.typeMeet(hint, expression.type);
    return SourceExpressionUnary({
      location: expression.location,
      type: expression.type,
      associatedComments: expression.associatedComments,
      operator: expression.operator,
      expression: this.typeCheck(expression.expression, expression.type),
    });
  }

  private typeCheckFunctionCall(
    expression: FunctionCallExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    let checkedFunctionExpression: SamlangExpression;
    let typeParameters: readonly string[];
    switch (expression.functionExpression.__type__) {
      case 'ClassMemberExpression': {
        const { partiallyCheckedExpression, unsolvedTypeParameters } =
          this.typeCheckClassMemberWithPotentiallyUnresolvedTypeParameters(
            expression.functionExpression,
            null
          );
        checkedFunctionExpression = partiallyCheckedExpression;
        typeParameters = unsolvedTypeParameters;
        break;
      }
      case 'FieldAccessExpression': {
        const { partiallyCheckedExpression, unsolvedTypeParameters } =
          this.typeCheckFieldOrMethodAccessWithPotentiallyUnresolvedTypeParameters(
            expression.functionExpression,
            null
          );
        checkedFunctionExpression = partiallyCheckedExpression;
        typeParameters = unsolvedTypeParameters;
        break;
      }
      default:
        checkedFunctionExpression = this.typeCheck(expression.functionExpression, null);
        typeParameters = [];
        break;
    }
    if (
      checkedFunctionExpression.type.type === 'PrimitiveType' &&
      checkedFunctionExpression.type.name === 'unknown'
    ) {
      return SourceExpressionFunctionCall({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        functionExpression: this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
          checkedFunctionExpression,
          typeParameters,
          null
        ),
        functionArguments: expression.functionArguments,
      });
    }
    if (checkedFunctionExpression.type.type !== 'FunctionType') {
      this.errorCollector.reportUnexpectedTypeKindError(
        expression.location,
        'function',
        checkedFunctionExpression.type
      );
      return SourceExpressionFunctionCall({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        functionExpression: this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
          checkedFunctionExpression,
          typeParameters,
          null
        ),
        functionArguments: expression.functionArguments,
      });
    }
    const { solvedGenericType, solvedReturnType, checkedArguments } = typeCheckFunctionCall(
      checkedFunctionExpression.type,
      typeParameters,
      SourceReason(expression.location, null),
      expression.functionArguments,
      hint,
      this.typeCheck,
      this.errorCollector
    );
    return SourceExpressionFunctionCall({
      location: expression.location,
      type: {
        ...solvedReturnType,
        reason: SourceReason(expression.location, solvedGenericType.reason.definitionLocation),
      },
      associatedComments: expression.associatedComments,
      functionExpression: { ...checkedFunctionExpression, type: solvedGenericType },
      functionArguments: checkedArguments,
    });
  }

  private typeCheckBinary(
    expression: BinaryExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    let checkedExpression: SamlangExpression;
    switch (expression.operator.symbol) {
      case '*':
      case '/':
      case '%':
      case '+':
      case '-':
      case '<':
      case '<=':
      case '>':
      case '>=':
        checkedExpression = {
          ...expression,
          e1: this.typeCheck(
            expression.e1,
            SourceIntType(SourceReason(expression.e1.location, null))
          ),
          e2: this.typeCheck(
            expression.e2,
            SourceIntType(SourceReason(expression.e2.location, null))
          ),
        };
        break;
      case '&&':
      case '||':
        checkedExpression = {
          ...expression,
          e1: this.typeCheck(
            expression.e1,
            SourceBoolType(SourceReason(expression.e1.location, null))
          ),
          e2: this.typeCheck(
            expression.e2,
            SourceBoolType(SourceReason(expression.e2.location, null))
          ),
        };
        break;
      case '::':
        checkedExpression = {
          ...expression,
          e1: this.typeCheck(
            expression.e1,
            SourceStringType(SourceReason(expression.e1.location, null))
          ),
          e2: this.typeCheck(
            expression.e2,
            SourceStringType(SourceReason(expression.e2.location, null))
          ),
        };
        break;
      case '==':
      case '!=': {
        const e1 = this.typeCheck(expression.e1, null);
        const e2 = this.typeCheck(expression.e2, e1.type);
        checkedExpression = { ...expression, e1, e2 };
        break;
      }
    }
    this.typeMeet(hint, checkedExpression.type);
    return checkedExpression;
  }

  private typeCheckIfElse(
    expression: IfElseExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    const boolExpression = this.typeCheck(
      expression.boolExpression,
      SourceBoolType(SourceReason(expression.boolExpression.location, null))
    );
    const e1 = this.typeCheck(expression.e1, hint);
    const e2 = this.typeCheck(expression.e2, e1.type);
    return SourceExpressionIfElse({
      location: expression.location,
      type: { ...e2.type, reason: SourceReason(expression.location, null) },
      associatedComments: expression.associatedComments,
      boolExpression,
      e1,
      e2,
    });
  }

  private typeCheckMatch(expression: MatchExpression, hint: SamlangType | null): SamlangExpression {
    const checkedMatchedExpression = this.typeCheck(expression.matchedExpression, null);
    const checkedMatchedExpressionType = checkedMatchedExpression.type;
    if (checkedMatchedExpressionType.type !== 'IdentifierType') {
      this.errorCollector.reportUnexpectedTypeKindError(
        checkedMatchedExpression.location,
        'identifier',
        checkedMatchedExpressionType
      );
      return SourceExpressionMatch({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        matchedExpression: checkedMatchedExpression,
        matchingList: expression.matchingList,
      });
    }
    const variantTypeDefinition = this.accessibleGlobalTypingContext.resolveTypeDefinition(
      checkedMatchedExpressionType,
      'variant'
    );
    let variantNames: readonly string[];
    let variantMappings: Readonly<Record<string, SourceFieldType>>;
    switch (variantTypeDefinition.type) {
      case 'Resolved':
        variantNames = variantTypeDefinition.names;
        variantMappings = variantTypeDefinition.mappings;
        break;
      case 'IllegalOtherClassMatch':
        this.errorCollector.reportIllegalOtherClassMatch(checkedMatchedExpression.location);
        return SourceExpressionMatch({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          matchedExpression: checkedMatchedExpression,
          matchingList: expression.matchingList,
        });
      case 'UnsupportedClassTypeDefinition':
        this.errorCollector.reportUnsupportedClassTypeDefinitionError(
          checkedMatchedExpression.location,
          'variant'
        );
        return SourceExpressionMatch({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          matchedExpression: checkedMatchedExpression,
          matchingList: expression.matchingList,
        });
    }
    const unusedMappings = { ...variantMappings };
    const checkedMatchingList = filterMap(
      expression.matchingList,
      ({
        location,
        tag: { name: tag, location: tagLocation, associatedComments: tagAssociatedComments },
        dataVariable,
        expression: correspondingExpression,
      }) => {
        const mappingDataType = unusedMappings[tag]?.type;
        if (mappingDataType == null) {
          this.errorCollector.reportUnresolvedNameError(tagLocation, tag);
          return null;
        }
        delete unusedMappings[tag];
        let checkedExpression: SamlangExpression;
        let checkedDatadataVariable: readonly [SourceIdentifier, SamlangType] | undefined =
          undefined;
        if (dataVariable == null) {
          checkedExpression = this.typeCheck(correspondingExpression, hint);
        } else {
          const {
            name: dataVariableName,
            location: dataVariableLocation,
            associatedComments: dataVariableAssociatedComments,
          } = dataVariable[0];
          this.localTypingContext.write(dataVariableLocation, mappingDataType);

          checkedExpression = this.typeCheck(correspondingExpression, hint);
          checkedDatadataVariable = [
            {
              name: dataVariableName,
              location: dataVariableLocation,
              associatedComments: dataVariableAssociatedComments,
            },
            mappingDataType,
          ];
        }
        const tagOrder = variantNames.findIndex((name) => name === tag);
        assert(tagOrder !== -1, `Bad tag: ${tag}`);
        return {
          location,
          tag: { name: tag, location: tagLocation, associatedComments: tagAssociatedComments },
          tagOrder,
          dataVariable: checkedDatadataVariable,
          expression: checkedExpression,
        };
      }
    );
    const unusedTags = Object.keys(unusedMappings);
    if (unusedTags.length > 0) {
      this.errorCollector.reportNonExhausiveMatchError(expression.location, unusedTags);
    }
    const matchingListTypes = checkedMatchingList.map((it) => it.expression.type);
    const finalType = matchingListTypes.reduce(
      (general, specific) => this.typeMeet(general, specific),
      checkNotNull(hint ?? matchingListTypes[0])
    );
    return SourceExpressionMatch({
      location: expression.location,
      type: finalType,
      associatedComments: expression.associatedComments,
      matchedExpression: checkedMatchedExpression,
      matchingList: checkedMatchingList,
    });
  }

  private inferLambdaTypeParameters(
    expression: LambdaExpression,
    hint: SamlangType | null
  ): readonly (readonly [SourceIdentifier, SamlangType])[] {
    if (hint != null) {
      if (hint.type === 'FunctionType') {
        if (hint.argumentTypes.length === expression.parameters.length) {
          return zip(hint.argumentTypes, expression.parameters).map(
            ([parameterHint, [parameterName, parameterType]]) => {
              const type = this.typeMeet(parameterHint, parameterType);
              this.localTypingContext.write(parameterName.location, type);
              return [parameterName, type];
            }
          );
        } else {
          this.errorCollector.reportArityMismatchError(
            expression.location,
            'function arguments',
            hint.argumentTypes.length,
            expression.parameters.length
          );
        }
      } else {
        this.errorCollector.reportUnexpectedTypeKindError(
          expression.location,
          prettyPrintType(hint),
          expression.type
        );
      }
    }
    expression.parameters.forEach(([parameterName, parameterType]) => {
      this.localTypingContext.write(parameterName.location, parameterType);
    });
    return expression.parameters;
  }

  private typeCheckLambda(
    expression: LambdaExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    const parameters = this.inferLambdaTypeParameters(expression, hint);
    const bodyTypeHint = hint != null && hint.type === 'FunctionType' ? hint.returnType : null;
    const body = this.typeCheck(expression.body, bodyTypeHint);
    const captured = this.localTypingContext.getCaptured(expression.location);
    const type = SourceFunctionType(
      SourceReason(expression.location, expression.location),
      expression.type.argumentTypes,
      body.type
    );
    return SourceExpressionLambda({
      location: expression.location,
      type,
      associatedComments: expression.associatedComments,
      parameters,
      captured: Object.fromEntries(captured.entries()),
      body,
    });
  }

  private typeCheckStatementBlock(
    expression: StatementBlockExpression,
    hint: SamlangType | null
  ): SamlangExpression {
    const reason = SourceReason(expression.location, expression.location);
    if (expression.block.expression == null) {
      this.typeMeet(hint, SourceUnitType(reason));
    }
    const checkedStatements = expression.block.statements.map((statement) =>
      this.typeCheckValStatement(statement)
    );
    const checkedStatementBlock =
      expression.block.expression != null
        ? {
            location: expression.block.location,
            statements: checkedStatements,
            expression: this.typeCheck(expression.block.expression, hint),
          }
        : { location: expression.block.location, statements: checkedStatements };
    return SourceExpressionStatementBlock({
      location: expression.location,
      associatedComments: expression.associatedComments,
      type: checkedStatementBlock.expression?.type ?? SourceUnitType(reason),
      block: checkedStatementBlock,
    });
  }

  private typeCheckValStatement(statement: SamlangValStatement): SamlangValStatement {
    const { location, pattern, typeAnnotation, assignedExpression } = statement;
    const checkedAssignedExpression = this.typeCheck(assignedExpression, typeAnnotation);
    const checkedAssignedExpressionType = checkedAssignedExpression.type;
    let checkedPattern: Pattern;
    switch (pattern.type) {
      case 'ObjectPattern': {
        if (checkedAssignedExpressionType.type !== 'IdentifierType') {
          this.errorCollector.reportUnexpectedTypeKindError(
            assignedExpression.location,
            'identifier',
            checkedAssignedExpressionType
          );
          return {
            location: statement.location,
            associatedComments: statement.associatedComments,
            pattern: statement.pattern,
            typeAnnotation,
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
              assignedExpression.location,
              'object'
            );
            return {
              location: statement.location,
              associatedComments: statement.associatedComments,
              pattern: statement.pattern,
              typeAnnotation,
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
            this.errorCollector.reportUnresolvedNameError(originalName.location, originalName.name);
            return {
              location: statement.location,
              associatedComments: statement.associatedComments,
              pattern: statement.pattern,
              typeAnnotation,
              assignedExpression: checkedAssignedExpression,
            };
          }
          const { isPublic, type: fieldType } = fieldInformation;
          if (
            checkedAssignedExpressionType.identifier !==
              this.accessibleGlobalTypingContext.currentClass &&
            !isPublic
          ) {
            this.errorCollector.reportUnresolvedNameError(originalName.location, originalName.name);
            return {
              location: statement.location,
              associatedComments: statement.associatedComments,
              pattern: statement.pattern,
              typeAnnotation,
              assignedExpression: checkedAssignedExpression,
            };
          }
          const nameToBeUsed = renamedName ?? originalName;
          this.localTypingContext.write(nameToBeUsed.location, fieldType);
          const fieldOrder = checkNotNull(fieldOrderMapping[originalName.name]);
          destructedNames.push({ ...destructedName, type: fieldType, fieldOrder });
        }
        checkedPattern = { location, type: 'ObjectPattern', destructedNames };
        break;
      }

      case 'VariablePattern':
        this.localTypingContext.write(pattern.location, checkedAssignedExpressionType);
        checkedPattern = pattern;
        break;

      case 'WildCardPattern':
        checkedPattern = pattern;
        break;
    }
    return {
      location: statement.location,
      pattern: checkedPattern,
      typeAnnotation,
      assignedExpression: checkedAssignedExpression,
      associatedComments: statement.associatedComments,
    };
  }
}

export default function typeCheckExpression(
  expression: SamlangExpression,
  errorCollector: ModuleErrorCollector,
  accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
  localTypingContext: LocationBasedLocalTypingContext,
  hint: SamlangType
): SamlangExpression {
  const checker = new ExpressionTypeChecker(
    accessibleGlobalTypingContext,
    localTypingContext,
    errorCollector
  );
  return checker.typeCheck(expression, hint);
}
