import { ModuleReference, SourceReason } from '../ast/common-nodes';
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
  SamlangModule,
  SamlangType,
  SamlangValStatement,
  SourceBoolType,
  SourceExpressionBinary,
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
  sourceExpressionWithNewType,
  SourceFieldType,
  SourceFunctionType,
  SourceIdentifier,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
  SourceUnknownType,
  StatementBlockExpression,
  ThisExpression,
  TypeParameterSignature,
  typeReposition,
  UnaryExpression,
  VariableExpression,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { assert, checkNotNull, filterMap, zip } from '../utils';
import contextualTypeMeet from './contextual-type-meet';
import typeCheckFunctionCall from './function-call-type-checker';
import performSSAAnalysisOnSamlangModule from './ssa-analysis';
import { solveTypeConstraints } from './type-constraints-solver';
import performTypeSubstitution from './type-substitution';
import {
  GlobalTypingContext,
  LocationBasedLocalTypingContext,
  TypingContext,
} from './typing-context';

class ExpressionTypeChecker {
  constructor(private readonly context: TypingContext) {}

  private get localTypingContext(): LocationBasedLocalTypingContext {
    return this.context.localTypingContext;
  }

  private get errorReporter(): GlobalErrorReporter {
    return this.context.errorReporter;
  }

  readonly typeCheck = (
    expression: SamlangExpression,
    hint: SamlangType | null,
  ): SamlangExpression => {
    assert(
      expression.__type__ !== 'MethodAccessExpression',
      'Raw parsed expression does not contain this!',
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
    general == null ? specific : contextualTypeMeet(general, specific, this.errorReporter);

  private readonly bestEffortUnknownType = (
    general: SamlangType | null,
    expression: SamlangExpression,
  ): SamlangType =>
    this.typeMeet(general, SourceUnknownType(SourceReason(expression.location, null)));

  private typeCheckLiteral(
    expression: LiteralExpression,
    hint: SamlangType | null,
  ): SamlangExpression {
    this.typeMeet(hint, expression.type);
    // Literals are already well typed if it passed the previous check.
    return expression;
  }

  private typeCheckThis(expression: ThisExpression, hint: SamlangType | null): SamlangExpression {
    return SourceExpressionThis({
      location: expression.location,
      type: this.typeMeet(hint, this.localTypingContext.read(expression.location)),
      associatedComments: expression.associatedComments,
    });
  }

  private typeCheckVariable(
    expression: VariableExpression,
    hint: SamlangType | null,
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
    hint: SamlangType | null,
  ): {
    partiallyCheckedExpression: ClassMemberExpression;
    unsolvedTypeParameters: readonly TypeParameterSignature[];
  } {
    const classFunctionTypeInformation = this.context.getFunctionType(
      expression.moduleReference,
      expression.className.name,
      expression.memberName.name,
      expression.location,
    );
    if (classFunctionTypeInformation == null) {
      this.errorReporter.reportUnresolvedNameError(
        expression.location,
        `${expression.className.name}.${expression.memberName.name}`,
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
    if (expression.typeArguments.length !== 0) {
      if (expression.typeArguments.length === classFunctionTypeInformation.typeParameters.length) {
        const type = this.typeMeet(
          hint,
          performTypeSubstitution(
            classFunctionTypeInformation.type,
            new Map(
              zip(
                classFunctionTypeInformation.typeParameters.map((it) => it.name),
                expression.typeArguments,
              ),
            ),
          ),
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
      this.errorReporter.reportArityMismatchError(
        expression.location,
        'type arguments',
        classFunctionTypeInformation.typeParameters.length,
        expression.typeArguments.length,
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
      if (hint.__type__ === 'FunctionType') {
        if (hint.argumentTypes.length === classFunctionTypeInformation.type.argumentTypes.length) {
          // Hint matches the shape and can be useful.
          const { solvedGenericType } = solveTypeConstraints(
            hint,
            classFunctionTypeInformation.type,
            classFunctionTypeInformation.typeParameters,
            this.errorReporter,
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
        this.errorReporter.reportArityMismatchError(
          expression.location,
          'parameter',
          hint.argumentTypes.length,
          classFunctionTypeInformation.type.argumentTypes.length,
        );
      } else {
        this.errorReporter.reportUnexpectedTypeKindError(
          expression.location,
          prettyPrintType(hint),
          'function',
        );
      }
    }
    // When hint is bad or there is no hint, we need to give up and let context help us more.
    const partiallyCheckedExpression = SourceExpressionClassMember({
      location: expression.location,
      type: classFunctionTypeInformation.type,
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
    unsolvedTypeParameters: readonly TypeParameterSignature[],
    hint: SamlangType | null,
  ): SamlangExpression {
    if (unsolvedTypeParameters.length !== 0) {
      this.errorReporter.reportInsufficientTypeInferenceContextError(expression.location);
    }
    const type = this.typeMeet(
      hint,
      performTypeSubstitution(
        expression.type,
        new Map(
          unsolvedTypeParameters.map((it) => [
            it.name,
            this.bestEffortUnknownType(null, expression),
          ]),
        ),
      ),
    );
    return sourceExpressionWithNewType(expression, type);
  }

  private typeCheckClassMember(
    expression: ClassMemberExpression,
    hint: SamlangType | null,
  ): SamlangExpression {
    const { partiallyCheckedExpression, unsolvedTypeParameters } =
      this.typeCheckClassMemberWithPotentiallyUnresolvedTypeParameters(expression, hint);
    return this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
      partiallyCheckedExpression,
      unsolvedTypeParameters,
      hint,
    );
  }

  private typeCheckFieldOrMethodAccessWithPotentiallyUnresolvedTypeParameters(
    expression: FieldAccessExpression,
    hint: SamlangType | null,
  ): {
    partiallyCheckedExpression: FieldAccessExpression | MethodAccessExpression;
    unsolvedTypeParameters: readonly TypeParameterSignature[];
  } {
    const checkedExpression = this.typeCheck(expression.expression, null);
    if (checkedExpression.type.__type__ !== 'IdentifierType') {
      this.errorReporter.reportUnexpectedTypeKindError(
        checkedExpression.location,
        'identifier',
        checkedExpression.type,
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
    const methodTypeInformation = this.context.getMethodType(
      checkedExpression.type.moduleReference,
      checkedExpression.type.identifier,
      expression.fieldName.name,
      checkedExpression.type.typeArguments,
      expression.location,
    );
    if (methodTypeInformation != null) {
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
        if (hint.__type__ === 'FunctionType') {
          if (hint.argumentTypes.length === methodTypeInformation.type.argumentTypes.length) {
            // Hint matches the shape and can be useful.
            const { solvedGenericType } = solveTypeConstraints(
              hint,
              methodTypeInformation.type,
              methodTypeInformation.typeParameters,
              this.errorReporter,
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
          this.errorReporter.reportArityMismatchError(
            expression.location,
            'parameter',
            hint.argumentTypes.length,
            methodTypeInformation.type.argumentTypes.length,
          );
        } else {
          this.errorReporter.reportUnexpectedTypeKindError(
            expression.location,
            prettyPrintType(hint),
            'function',
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
      const fieldMappingsOrError = this.context.resolveTypeDefinition(
        checkedExpression.type,
        'object',
      );
      assert(fieldMappingsOrError.type !== 'IllegalOtherClassMatch', 'Impossible!');
      if (fieldMappingsOrError.type === 'UnsupportedClassTypeDefinition') {
        this.errorReporter.reportUnsupportedClassTypeDefinitionError(
          checkedExpression.location,
          'object',
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
      const fieldType = fieldMappings.get(expression.fieldName.name);
      if (fieldType == null) {
        this.errorReporter.reportUnresolvedNameError(
          expression.fieldName.location,
          expression.fieldName.name,
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
      if (checkedExpression.type.identifier !== this.context.currentClass && !fieldType.isPublic) {
        this.errorReporter.reportUnresolvedNameError(
          expression.fieldName.location,
          expression.fieldName.name,
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
        type: this.typeMeet(hint, typeReposition(fieldType.type, expression.location)),
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
    hint: SamlangType | null,
  ): SamlangExpression {
    const { partiallyCheckedExpression, unsolvedTypeParameters } =
      this.typeCheckFieldOrMethodAccessWithPotentiallyUnresolvedTypeParameters(expression, hint);
    if (partiallyCheckedExpression.__type__ === 'FieldAccessExpression') {
      return partiallyCheckedExpression;
    }
    return this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
      partiallyCheckedExpression,
      unsolvedTypeParameters,
      hint,
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
    hint: SamlangType | null,
  ): SamlangExpression {
    let checkedFunctionExpressionWithUnresolvedGenericType: SamlangExpression;
    let typeParameters: readonly TypeParameterSignature[];
    switch (expression.functionExpression.__type__) {
      case 'ClassMemberExpression': {
        const { partiallyCheckedExpression, unsolvedTypeParameters } =
          this.typeCheckClassMemberWithPotentiallyUnresolvedTypeParameters(
            expression.functionExpression,
            null,
          );
        checkedFunctionExpressionWithUnresolvedGenericType = partiallyCheckedExpression;
        typeParameters = unsolvedTypeParameters;
        break;
      }
      case 'FieldAccessExpression': {
        const { partiallyCheckedExpression, unsolvedTypeParameters } =
          this.typeCheckFieldOrMethodAccessWithPotentiallyUnresolvedTypeParameters(
            expression.functionExpression,
            null,
          );
        checkedFunctionExpressionWithUnresolvedGenericType = partiallyCheckedExpression;
        typeParameters = unsolvedTypeParameters;
        break;
      }
      default:
        checkedFunctionExpressionWithUnresolvedGenericType = this.typeCheck(
          expression.functionExpression,
          null,
        );
        typeParameters = [];
        break;
    }
    if (checkedFunctionExpressionWithUnresolvedGenericType.type.__type__ === 'UnknownType') {
      return SourceExpressionFunctionCall({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        functionExpression: this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
          checkedFunctionExpressionWithUnresolvedGenericType,
          typeParameters,
          null,
        ),
        functionArguments: expression.functionArguments,
      });
    }
    if (checkedFunctionExpressionWithUnresolvedGenericType.type.__type__ !== 'FunctionType') {
      this.errorReporter.reportUnexpectedTypeKindError(
        expression.location,
        'function',
        checkedFunctionExpressionWithUnresolvedGenericType.type,
      );
      return SourceExpressionFunctionCall({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        functionExpression: this.replaceUndecidedTypeParameterWithUnknownAndUpdateType(
          checkedFunctionExpressionWithUnresolvedGenericType,
          typeParameters,
          null,
        ),
        functionArguments: expression.functionArguments,
      });
    }
    const { solvedGenericType, solvedReturnType, checkedArguments } = typeCheckFunctionCall(
      checkedFunctionExpressionWithUnresolvedGenericType.type,
      typeParameters,
      SourceReason(expression.location, null),
      expression.functionArguments,
      hint,
      this.typeCheck,
      this.context.isSubtype,
      this.errorReporter,
    );
    const fullyResolvedCheckedFunctionExpression = sourceExpressionWithNewType(
      checkedFunctionExpressionWithUnresolvedGenericType,
      solvedGenericType,
    );
    return SourceExpressionFunctionCall({
      location: expression.location,
      type: solvedReturnType,
      associatedComments: expression.associatedComments,
      functionExpression: fullyResolvedCheckedFunctionExpression,
      functionArguments: checkedArguments,
    });
  }

  private typeCheckBinary(
    expression: BinaryExpression,
    hint: SamlangType | null,
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
        checkedExpression = SourceExpressionBinary({
          location: expression.location,
          type: expression.type,
          operator: expression.operator,
          operatorPrecedingComments: expression.operatorPrecedingComments,
          e1: this.typeCheck(
            expression.e1,
            SourceIntType(SourceReason(expression.e1.location, null)),
          ),
          e2: this.typeCheck(
            expression.e2,
            SourceIntType(SourceReason(expression.e2.location, null)),
          ),
        });
        break;
      case '&&':
      case '||':
        checkedExpression = SourceExpressionBinary({
          location: expression.location,
          type: expression.type,
          operator: expression.operator,
          operatorPrecedingComments: expression.operatorPrecedingComments,
          e1: this.typeCheck(
            expression.e1,
            SourceBoolType(SourceReason(expression.e1.location, null)),
          ),
          e2: this.typeCheck(
            expression.e2,
            SourceBoolType(SourceReason(expression.e2.location, null)),
          ),
        });
        break;
      case '::':
        checkedExpression = SourceExpressionBinary({
          location: expression.location,
          type: expression.type,
          operator: expression.operator,
          operatorPrecedingComments: expression.operatorPrecedingComments,
          e1: this.typeCheck(
            expression.e1,
            SourceStringType(SourceReason(expression.e1.location, null)),
          ),
          e2: this.typeCheck(
            expression.e2,
            SourceStringType(SourceReason(expression.e2.location, null)),
          ),
        });
        break;
      case '==':
      case '!=': {
        const e1 = this.typeCheck(expression.e1, null);
        const e2 = this.typeCheck(expression.e2, e1.type);
        checkedExpression = SourceExpressionBinary({
          location: expression.location,
          type: expression.type,
          operator: expression.operator,
          operatorPrecedingComments: expression.operatorPrecedingComments,
          e1,
          e2,
        });
        break;
      }
    }
    this.typeMeet(hint, checkedExpression.type);
    return checkedExpression;
  }

  private typeCheckIfElse(
    expression: IfElseExpression,
    hint: SamlangType | null,
  ): SamlangExpression {
    const boolExpression = this.typeCheck(
      expression.boolExpression,
      SourceBoolType(SourceReason(expression.boolExpression.location, null)),
    );
    const e1 = this.typeCheck(expression.e1, hint);
    const e2 = this.typeCheck(expression.e2, e1.type);
    return SourceExpressionIfElse({
      location: expression.location,
      type: typeReposition(e2.type, expression.location),
      associatedComments: expression.associatedComments,
      boolExpression,
      e1,
      e2,
    });
  }

  private typeCheckMatch(expression: MatchExpression, hint: SamlangType | null): SamlangExpression {
    const checkedMatchedExpression = this.typeCheck(expression.matchedExpression, null);
    const checkedMatchedExpressionType = checkedMatchedExpression.type;
    if (checkedMatchedExpressionType.__type__ !== 'IdentifierType') {
      this.errorReporter.reportUnexpectedTypeKindError(
        checkedMatchedExpression.location,
        'identifier',
        checkedMatchedExpressionType,
      );
      return SourceExpressionMatch({
        location: expression.location,
        type: this.bestEffortUnknownType(hint, expression),
        associatedComments: expression.associatedComments,
        matchedExpression: checkedMatchedExpression,
        matchingList: expression.matchingList,
      });
    }
    const variantTypeDefinition = this.context.resolveTypeDefinition(
      checkedMatchedExpressionType,
      'variant',
    );
    let variantNames: readonly string[];
    let variantMappings: ReadonlyMap<string, SourceFieldType>;
    switch (variantTypeDefinition.type) {
      case 'Resolved':
        variantNames = variantTypeDefinition.names;
        variantMappings = variantTypeDefinition.mappings;
        break;
      case 'IllegalOtherClassMatch':
        this.errorReporter.reportIllegalOtherClassMatch(checkedMatchedExpression.location);
        return SourceExpressionMatch({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          matchedExpression: checkedMatchedExpression,
          matchingList: expression.matchingList,
        });
      case 'UnsupportedClassTypeDefinition':
        this.errorReporter.reportUnsupportedClassTypeDefinitionError(
          checkedMatchedExpression.location,
          'variant',
        );
        return SourceExpressionMatch({
          location: expression.location,
          type: this.bestEffortUnknownType(hint, expression),
          associatedComments: expression.associatedComments,
          matchedExpression: checkedMatchedExpression,
          matchingList: expression.matchingList,
        });
    }
    const unusedMappings = new Map(variantMappings);
    const checkedMatchingList = filterMap(
      expression.matchingList,
      ({
        location,
        tag: { name: tag, location: tagLocation, associatedComments: tagAssociatedComments },
        dataVariable,
        expression: correspondingExpression,
      }) => {
        const mappingDataType = unusedMappings.get(tag)?.type;
        if (mappingDataType == null) {
          this.errorReporter.reportUnresolvedNameError(tagLocation, tag);
          return null;
        }
        unusedMappings.delete(tag);
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
      },
    );
    const unusedTags = Array.from(unusedMappings.keys());
    if (unusedTags.length > 0) {
      this.errorReporter.reportNonExhausiveMatchError(expression.location, unusedTags);
    }
    const matchingListTypes = checkedMatchingList.map((it) => it.expression.type);
    const finalType = matchingListTypes.reduce(
      (general, specific) => this.typeMeet(general, specific),
      checkNotNull(hint ?? matchingListTypes[0]),
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
    hint: SamlangType | null,
  ): readonly SamlangType[] {
    if (hint != null) {
      if (hint.__type__ === 'FunctionType') {
        if (hint.argumentTypes.length === expression.parameters.length) {
          return zip(hint.argumentTypes, expression.parameters).map(
            ([parameterHint, parameter]) => {
              const type = this.typeMeet(
                parameterHint,
                parameter.typeAnnotation ??
                  SourceUnknownType(SourceReason(parameter.name.location, null)),
              );
              this.localTypingContext.write(parameter.name.location, type);
              return type;
            },
          );
        } else {
          this.errorReporter.reportArityMismatchError(
            expression.location,
            'function arguments',
            hint.argumentTypes.length,
            expression.parameters.length,
          );
        }
      } else {
        this.errorReporter.reportUnexpectedTypeKindError(
          expression.location,
          prettyPrintType(hint),
          expression.type,
        );
      }
    }
    return expression.parameters.map(({ name, typeAnnotation }) => {
      const type = typeAnnotation ?? SourceUnknownType(SourceReason(name.location, null));
      if (type.__type__ === 'UnknownType') {
        this.errorReporter.reportInsufficientTypeInferenceContextError(name.location);
      }
      this.localTypingContext.write(name.location, type);
      return type;
    });
  }

  private typeCheckLambda(
    expression: LambdaExpression,
    hint: SamlangType | null,
  ): SamlangExpression {
    const argumentTypes = this.inferLambdaTypeParameters(expression, hint);
    const bodyTypeHint = hint != null && hint.__type__ === 'FunctionType' ? hint.returnType : null;
    const body = this.typeCheck(expression.body, bodyTypeHint);
    const captured = this.localTypingContext.getCaptured(expression.location);
    const type = SourceFunctionType(
      SourceReason(expression.location, expression.location),
      argumentTypes,
      body.type,
    );
    return SourceExpressionLambda({
      location: expression.location,
      type,
      associatedComments: expression.associatedComments,
      parameters: expression.parameters,
      captured: new Map(captured),
      body,
    });
  }

  private typeCheckStatementBlock(
    expression: StatementBlockExpression,
    hint: SamlangType | null,
  ): SamlangExpression {
    const reason = SourceReason(expression.location, expression.location);
    if (expression.block.expression == null) {
      this.typeMeet(hint, SourceUnitType(reason));
    }
    const checkedStatements = expression.block.statements.map((statement) =>
      this.typeCheckValStatement(statement),
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
        if (checkedAssignedExpressionType.__type__ !== 'IdentifierType') {
          this.errorReporter.reportUnexpectedTypeKindError(
            assignedExpression.location,
            'identifier',
            checkedAssignedExpressionType,
          );
          return {
            location: statement.location,
            associatedComments: statement.associatedComments,
            pattern: statement.pattern,
            typeAnnotation,
            assignedExpression: checkedAssignedExpression,
          };
        }
        const fieldMappingsOrError = this.context.resolveTypeDefinition(
          checkedAssignedExpressionType,
          'object',
        );
        let fieldNamesMappings: {
          readonly fieldNames: readonly string[];
          readonly fieldMappings: ReadonlyMap<string, SourceFieldType>;
        };
        assert(
          fieldMappingsOrError.type !== 'IllegalOtherClassMatch',
          'We match on objects here, so this case is impossible.',
        );
        switch (fieldMappingsOrError.type) {
          case 'Resolved':
            fieldNamesMappings = {
              fieldNames: fieldMappingsOrError.names,
              fieldMappings: fieldMappingsOrError.mappings,
            };
            break;
          case 'UnsupportedClassTypeDefinition':
            this.errorReporter.reportUnsupportedClassTypeDefinitionError(
              assignedExpression.location,
              'object',
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
        const fieldOrderMapping = new Map(fieldNames.map((name, index) => [name, index]));
        const destructedNames: ObjectPatternDestucturedName[] = [];
        for (let i = 0; i < pattern.destructedNames.length; i += 1) {
          const destructedName: ObjectPatternDestucturedName = checkNotNull(
            pattern.destructedNames[i],
          );
          const { fieldName: originalName, alias: renamedName } = destructedName;
          const fieldInformation = fieldMappings.get(originalName.name);
          if (fieldInformation == null) {
            this.errorReporter.reportUnresolvedNameError(originalName.location, originalName.name);
            return {
              location: statement.location,
              associatedComments: statement.associatedComments,
              pattern: statement.pattern,
              typeAnnotation,
              assignedExpression: checkedAssignedExpression,
            };
          }
          const { isPublic, type: fieldType } = fieldInformation;
          if (checkedAssignedExpressionType.identifier !== this.context.currentClass && !isPublic) {
            this.errorReporter.reportUnresolvedNameError(originalName.location, originalName.name);
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
          const fieldOrder = checkNotNull(fieldOrderMapping.get(originalName.name));
          destructedNames.push({
            fieldName: originalName,
            fieldOrder,
            type: fieldType,
            alias: renamedName,
            location: destructedName.location,
          });
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

export function typeCheckExpression(
  expression: SamlangExpression,
  context: TypingContext,
  hint: SamlangType,
): SamlangExpression {
  return new ExpressionTypeChecker(context).typeCheck(expression, hint);
}

export function typeCheckSamlangModule(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  globalTypingContext: GlobalTypingContext,
  errorReporter: GlobalErrorReporter,
): SamlangModule {
  const ssaResult = performSSAAnalysisOnSamlangModule(samlangModule, errorReporter);
  const localTypingContext = new LocationBasedLocalTypingContext(ssaResult);

  samlangModule.interfaces.forEach((interfaceDeclaration) => {
    interfaceDeclaration.members.forEach((member) => {
      member.parameters.forEach((parameter) => {
        localTypingContext.write(parameter.nameLocation, parameter.type);
      });
    });
  });

  const checkedClasses = samlangModule.classes.map((classDefinition) => {
    const context = new TypingContext(
      globalTypingContext,
      localTypingContext,
      errorReporter,
      moduleReference,
      classDefinition.name.name,
    );
    localTypingContext.write(
      classDefinition.location,
      SourceIdentifierType(
        SourceReason(classDefinition.name.location, classDefinition.name.location),
        moduleReference,
        classDefinition.name.name,
        classDefinition.typeParameters.map((it) =>
          SourceIdentifierType(
            SourceReason(it.location, it.location),
            moduleReference,
            it.name.name,
          ),
        ),
      ),
    );
    const checkedMembers = filterMap(classDefinition.members, (member) => {
      member.parameters.forEach((parameter) => {
        localTypingContext.write(parameter.nameLocation, parameter.type);
      });
      return {
        ...member,
        body: typeCheckExpression(member.body, context, member.type.returnType),
      };
    });
    return { ...classDefinition, members: checkedMembers };
  });
  return { ...samlangModule, classes: checkedClasses };
}
