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
  SamlangExpression,
  SamlangFunctionType,
  SamlangType,
  SourceBoolType,
  SourceExpressionFunctionCall,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionMethodAccess,
  SourceFieldType,
  SourceFunctionType,
  SourceIdentifier,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
  StatementBlockExpression,
  ThisExpression,
  TupleConstructorExpression,
  UnaryExpression,
  UndecidedTypes,
  VariableExpression,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, filterMap, ignore, LocalStackedContext, zip } from '../utils';
import { ConstraintAwareChecker } from './constraint-aware-checker';
import fixExpressionType from './expression-type-fixer';
import StatementTypeChecker from './statement-type-checker';
import type TypeResolution from './type-resolution';
import performTypeSubstitution from './type-substitution';
import { undecideTypeParameters } from './type-undecider';
import { validateType } from './type-validator';
import type { AccessibleGlobalTypingContext } from './typing-context';

class ExpressionTypeChecker {
  private readonly constraintAwareTypeChecker: ConstraintAwareChecker;

  private readonly statementTypeChecker: StatementTypeChecker;

  constructor(
    private readonly accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private readonly localTypingContext: LocalStackedContext<SamlangType>,
    resolution: TypeResolution,
    public readonly errorCollector: ModuleErrorCollector
  ) {
    this.constraintAwareTypeChecker = new ConstraintAwareChecker(resolution, errorCollector);
    this.statementTypeChecker = new StatementTypeChecker(
      accessibleGlobalTypingContext,
      errorCollector,
      this.typeCheck
    );
  }

  readonly typeCheck = (
    expression: SamlangExpression,
    expectedType: SamlangType
  ): SamlangExpression => {
    assert(
      expression.__type__ !== 'MethodAccessExpression',
      'Raw parsed expression does not contain this!'
    );
    switch (expression.__type__) {
      case 'LiteralExpression':
        return this.typeCheckLiteral(expression, expectedType);
      case 'ThisExpression':
        return this.typeCheckThis(expression, expectedType);
      case 'VariableExpression':
        return this.typeCheckVariable(expression, expectedType);
      case 'ClassMemberExpression':
        return this.typeCheckClassMember(expression, expectedType);
      case 'TupleConstructorExpression':
        return this.typeCheckTupleConstructor(expression, expectedType);
      case 'FieldAccessExpression':
        return this.typeCheckFieldAccess(expression, expectedType);
      case 'UnaryExpression':
        return this.typeCheckUnary(expression, expectedType);
      case 'FunctionCallExpression':
        return this.typeCheckFunctionCall(expression, expectedType);
      case 'BinaryExpression':
        return this.typeCheckBinary(expression, expectedType);
      case 'IfElseExpression':
        return this.typeCheckIfElse(expression, expectedType);
      case 'MatchExpression':
        return this.typeCheckMatch(expression, expectedType);
      case 'LambdaExpression':
        return this.typeCheckLambda(expression, expectedType);
      case 'StatementBlockExpression':
        return this.typeCheckStatementBlock(expression, expectedType);
    }
  };

  /** Run a basic type checking where the expected type is the current type (often undecided). */
  private readonly basicTypeCheck = (expression: SamlangExpression): SamlangExpression =>
    this.typeCheck(expression, expression.type);

  private typeCheckLiteral(
    expression: LiteralExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    this.constraintAwareTypeChecker.checkAndInfer(expectedType, expression.type, expression.range);
    // Literals are already well typed if it passed the previous check.
    return expression;
  }

  private typeCheckThis(expression: ThisExpression, expectedType: SamlangType): SamlangExpression {
    const type = this.localTypingContext.getLocalValueType('this');
    if (type == null) {
      this.errorCollector.reportIllegalThisError(expression.range);
      return { ...expression, type: expectedType };
    }
    return {
      ...expression,
      type: this.constraintAwareTypeChecker.checkAndInfer(expectedType, type, expression.range),
    };
  }

  private typeCheckVariable(
    expression: VariableExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const locallyInferredType = this.localTypingContext.getLocalValueType(expression.name);
    if (locallyInferredType == null) {
      return { ...expression, type: expectedType };
    }
    const inferredType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      locallyInferredType,
      expression.range
    );
    return { ...expression, type: inferredType };
  }

  private typeCheckClassMember(
    expression: ClassMemberExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const classFunctionTypeInformation = this.accessibleGlobalTypingContext.getClassFunctionType(
      expression.moduleReference,
      expression.className.name,
      expression.memberName.name
    );
    if (classFunctionTypeInformation == null) {
      this.errorCollector.reportUnresolvedNameError(
        expression.range,
        `${expression.className.name}.${expression.memberName.name}`
      );
      return { ...expression, type: expectedType };
    }
    if (expression.typeArguments.length !== 0) {
      if (expression.typeArguments.length === classFunctionTypeInformation.typeParameters.length) {
        const type = this.constraintAwareTypeChecker.checkAndInfer(
          expectedType,
          performTypeSubstitution(
            classFunctionTypeInformation.type,
            Object.fromEntries(
              zip(classFunctionTypeInformation.typeParameters, expression.typeArguments)
            )
          ),
          expression.range
        );
        return { ...expression, type };
      }
      this.errorCollector.reportTypeArgumentsSizeMismatchError(
        expression.range,
        classFunctionTypeInformation.typeParameters.length,
        expression.typeArguments.length
      );
    }
    const [locallyInferredType, undecidedTypeArguments] = undecideTypeParameters(
      classFunctionTypeInformation.type,
      classFunctionTypeInformation.typeParameters
    );
    const constraintInferredType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      locallyInferredType,
      expression.range
    );
    return { ...expression, type: constraintInferredType, typeArguments: undecidedTypeArguments };
  }

  private typeCheckTupleConstructor(
    expression: TupleConstructorExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const checkedExpressions = expression.expressions.map(this.basicTypeCheck);
    const locallyInferredType = SourceTupleType(checkedExpressions.map((it) => it.type));
    const constraintInferredType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      locallyInferredType,
      expression.range
    );
    if (constraintInferredType.type === 'TupleType') {
      return { ...expression, type: constraintInferredType, expressions: checkedExpressions };
    }
    this.errorCollector.reportUnexpectedTypeKindError(
      expression.range,
      'tuple',
      constraintInferredType
    );
    return { ...expression, expressions: checkedExpressions, type: locallyInferredType };
  }

  private tryTypeCheckMethodAccess(
    expression: MethodAccessExpression
  ): Readonly<{ checkedExpression: SamlangExpression; methodType: SamlangFunctionType }> | null {
    const checkedExpression = this.basicTypeCheck(expression.expression);
    const checkedExpressionType = checkedExpression.type;
    if (checkedExpressionType.type !== 'IdentifierType') return null;
    const {
      moduleReference: checkedExprTypeModuleReference,
      identifier: checkedExprTypeIdentifier,
      typeArguments: checkedExprTypeArguments,
    } = checkedExpressionType;
    const methodTypeOrError = this.accessibleGlobalTypingContext.getClassMethodType(
      checkedExprTypeModuleReference,
      checkedExprTypeIdentifier,
      expression.methodName.name,
      checkedExprTypeArguments
    );
    if (methodTypeOrError.type !== 'FunctionType') return null;
    return { checkedExpression, methodType: methodTypeOrError };
  }

  private typeCheckFieldAccess(
    expression: FieldAccessExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const tryTypeCheckMethodAccessResult = this.tryTypeCheckMethodAccess(
      SourceExpressionMethodAccess({
        range: expression.range,
        type: expression.type,
        associatedComments: expression.associatedComments,
        expression: expression.expression,
        methodName: expression.fieldName,
      })
    );
    if (tryTypeCheckMethodAccessResult != null) {
      const { checkedExpression, methodType } = tryTypeCheckMethodAccessResult;
      const constraintInferredType = this.constraintAwareTypeChecker.checkAndInfer(
        expectedType,
        methodType,
        expression.range
      );
      return SourceExpressionMethodAccess({
        range: expression.range,
        type: constraintInferredType,
        associatedComments: expression.associatedComments,
        expression: checkedExpression,
        methodName: expression.fieldName,
      });
    }

    const checkedObjectExpression = this.basicTypeCheck(expression.expression);
    const checkedObjectExpressionType = checkedObjectExpression.type;
    if (checkedObjectExpressionType.type === 'UndecidedType') {
      this.errorCollector.reportInsufficientTypeInferenceContextError(
        checkedObjectExpression.range
      );
      return { ...expression, type: expectedType, expression: checkedObjectExpression };
    }
    if (checkedObjectExpressionType.type !== 'IdentifierType') {
      this.errorCollector.reportUnexpectedTypeKindError(
        checkedObjectExpression.range,
        'identifier',
        checkedObjectExpressionType
      );
      return { ...expression, type: expectedType, expression: checkedObjectExpression };
    }
    const fieldMappingsOrError = this.accessibleGlobalTypingContext.resolveTypeDefinition(
      checkedObjectExpressionType,
      'object'
    );
    let fieldNames: readonly string[];
    let fieldMappings: Readonly<Record<string, SourceFieldType>>;
    assert(fieldMappingsOrError.type !== 'IllegalOtherClassMatch', 'Impossible!');
    switch (fieldMappingsOrError.type) {
      case 'Resolved':
        fieldNames = fieldMappingsOrError.names;
        fieldMappings = fieldMappingsOrError.mappings;
        break;
      case 'UnsupportedClassTypeDefinition':
        this.errorCollector.reportUnsupportedClassTypeDefinitionError(
          checkedObjectExpression.range,
          'object'
        );
        return { ...expression, type: expectedType, expression: checkedObjectExpression };
    }
    const fieldType = fieldMappings[expression.fieldName.name];
    if (fieldType == null) {
      this.errorCollector.reportUnresolvedNameError(
        expression.fieldName.range,
        expression.fieldName.name
      );
      return { ...expression, type: expectedType, expression: checkedObjectExpression };
    }
    if (
      checkedObjectExpressionType.identifier !== this.accessibleGlobalTypingContext.currentClass &&
      !fieldType.isPublic
    ) {
      this.errorCollector.reportUnresolvedNameError(
        expression.fieldName.range,
        expression.fieldName.name
      );
      return { ...expression, type: expectedType, expression: checkedObjectExpression };
    }
    const constraintInferredFieldType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      fieldType.type,
      expression.range
    );
    const order = fieldNames.findIndex((name) => name === expression.fieldName.name);
    assert(order !== -1, `Bad field: ${expression.fieldName}`);
    return {
      ...expression,
      type: constraintInferredFieldType,
      fieldOrder: order,
      expression: checkedObjectExpression,
    };
  }

  private typeCheckUnary(
    expression: UnaryExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    // Type of unary expression can be decided at parse time.
    this.constraintAwareTypeChecker.checkAndInfer(expectedType, expression.type, expression.range);
    const checkedSubExpression = this.typeCheck(expression.expression, expression.type);
    return { ...expression, expression: checkedSubExpression };
  }

  private typeCheckFunctionCall(
    expression: FunctionCallExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const expectedTypeForFunction = SourceFunctionType(
      UndecidedTypes.nextN(expression.functionArguments.length),
      expectedType
    );
    const checkedFunctionExpression = this.typeCheck(
      expression.functionExpression,
      expectedTypeForFunction
    );
    const moreRefinedCheckedFunctionType =
      checkedFunctionExpression.type.type === 'FunctionType'
        ? checkedFunctionExpression.type
        : expectedTypeForFunction;
    const checkedArguments = zip(
      expression.functionArguments,
      moreRefinedCheckedFunctionType.argumentTypes
    ).map(([e, t]) => this.typeCheck(e, t));
    if (checkedFunctionExpression.type.type !== 'FunctionType') {
      this.errorCollector.reportUnexpectedTypeKindError(
        expression.functionExpression.range,
        'function',
        checkedFunctionExpression.type
      );
      return { ...expression, type: expectedType, functionExpression: checkedFunctionExpression };
    }
    const { returnType: locallyInferredReturnType } = moreRefinedCheckedFunctionType;
    const constraintInferredType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      locallyInferredReturnType,
      expression.range
    );
    return SourceExpressionFunctionCall({
      range: expression.range,
      type: constraintInferredType,
      associatedComments: expression.associatedComments,
      functionExpression: checkedFunctionExpression,
      functionArguments: checkedArguments,
    });
  }

  private typeCheckBinary(
    expression: BinaryExpression,
    expectedType: SamlangType
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
          e1: this.typeCheck(expression.e1, SourceIntType),
          e2: this.typeCheck(expression.e2, SourceIntType),
        };
        break;
      case '&&':
      case '||':
        checkedExpression = {
          ...expression,
          e1: this.typeCheck(expression.e1, SourceBoolType),
          e2: this.typeCheck(expression.e2, SourceBoolType),
        };
        break;
      case '::':
        checkedExpression = {
          ...expression,
          e1: this.typeCheck(expression.e1, SourceStringType),
          e2: this.typeCheck(expression.e2, SourceStringType),
        };
        break;
      case '==':
      case '!=': {
        const e1 = this.basicTypeCheck(expression.e1);
        const e2 = this.typeCheck(expression.e2, e1.type);
        checkedExpression = { ...expression, e1, e2 };
        break;
      }
    }
    this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      checkedExpression.type,
      expression.range
    );
    return checkedExpression;
  }

  private typeCheckIfElse(
    expression: IfElseExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const boolExpression = this.typeCheck(expression.boolExpression, SourceBoolType);
    const e1 = this.typeCheck(expression.e1, expectedType);
    const e2 = this.typeCheck(expression.e2, expectedType);
    const constraintInferredType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      e1.type,
      e1.range
    );
    this.constraintAwareTypeChecker.checkAndInfer(expectedType, e2.type, e2.range);
    return { ...expression, type: constraintInferredType, boolExpression, e1, e2 };
  }

  private typeCheckMatch(
    expression: MatchExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const checkedMatchedExpression = this.basicTypeCheck(expression.matchedExpression);
    const checkedMatchedExpressionType = checkedMatchedExpression.type;
    if (checkedMatchedExpressionType.type === 'UndecidedType') {
      this.errorCollector.reportInsufficientTypeInferenceContextError(
        checkedMatchedExpression.range
      );
      return { ...expression, matchedExpression: checkedMatchedExpression, type: expectedType };
    }
    if (checkedMatchedExpressionType.type !== 'IdentifierType') {
      this.errorCollector.reportUnexpectedTypeKindError(
        checkedMatchedExpression.range,
        'identifier',
        checkedMatchedExpressionType
      );
      return { ...expression, matchedExpression: checkedMatchedExpression, type: expectedType };
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
        this.errorCollector.reportIllegalOtherClassMatch(checkedMatchedExpression.range);
        return { ...expression, matchedExpression: checkedMatchedExpression, type: expectedType };
      case 'UnsupportedClassTypeDefinition':
        this.errorCollector.reportUnsupportedClassTypeDefinitionError(
          checkedMatchedExpression.range,
          'variant'
        );
        return { ...expression, matchedExpression: checkedMatchedExpression, type: expectedType };
    }
    const unusedMappings = { ...variantMappings };
    const checkedMatchingList = filterMap(
      expression.matchingList,
      ({
        range,
        tag: { name: tag, range: tagRange, associatedComments: tagAssociatedComments },
        dataVariable,
        expression: correspondingExpression,
      }) => {
        const mappingDataType = unusedMappings[tag]?.type;
        if (mappingDataType == null) {
          this.errorCollector.reportUnresolvedNameError(tagRange, tag);
          return null;
        }
        delete unusedMappings[tag];
        let checkedExpression: SamlangExpression;
        let checkedDatadataVariable: readonly [SourceIdentifier, SamlangType] | undefined =
          undefined;
        if (dataVariable == null) {
          checkedExpression = this.localTypingContext.withNestedScope(() =>
            this.typeCheck(correspondingExpression, expectedType)
          );
        } else {
          [checkedExpression, checkedDatadataVariable] = this.localTypingContext.withNestedScope(
            () => {
              const {
                name: dataVariableName,
                range: dataVariableRange,
                associatedComments: dataVariableAssociatedComments,
              } = dataVariable[0];
              this.localTypingContext.addLocalValueType(dataVariableName, mappingDataType, ignore);
              return [
                this.typeCheck(correspondingExpression, expectedType),
                [
                  {
                    name: dataVariableName,
                    range: dataVariableRange,
                    associatedComments: dataVariableAssociatedComments,
                  },
                  mappingDataType,
                ],
              ];
            }
          );
        }
        const tagOrder = variantNames.findIndex((name) => name === tag);
        assert(tagOrder !== -1, `Bad tag: ${tag}`);
        return {
          range,
          tag: { name: tag, range: tagRange, associatedComments: tagAssociatedComments },
          tagOrder,
          dataVariable: checkedDatadataVariable,
          expression: checkedExpression,
        };
      }
    );
    const unusedTags = Object.keys(unusedMappings);
    if (unusedTags.length > 0) {
      this.errorCollector.reportNonExhausiveMatchError(expression.range, unusedTags);
    }
    const finalType = checkedMatchingList
      .map((it) => it.expression.type)
      .reduce((expected, actual) =>
        this.constraintAwareTypeChecker.checkAndInfer(expected, actual, expression.range)
      );
    return SourceExpressionMatch({
      range: expression.range,
      type: finalType,
      associatedComments: expression.associatedComments,
      matchedExpression: checkedMatchedExpression,
      matchingList: checkedMatchingList,
    });
  }

  private typeCheckLambda(
    expression: LambdaExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    const [checkedBody, captured] = this.localTypingContext.withNestedScopeReturnCaptured(() => {
      // Validate parameters and add them to local context.
      this.constraintAwareTypeChecker.checkAndInfer(
        expectedType,
        expression.type,
        expression.range
      );
      expression.parameters.forEach(([parameterName, parameterType]) => {
        validateType(
          parameterType,
          this.accessibleGlobalTypingContext,
          this.errorCollector,
          expression.range
        );
        this.localTypingContext.addLocalValueType(parameterName.name, parameterType, ignore);
      });
      return this.typeCheck(expression.body, expression.type.returnType);
    });
    const locallyInferredType = SourceFunctionType(expression.type.argumentTypes, checkedBody.type);
    const constraintInferredType = this.constraintAwareTypeChecker.checkAndInfer(
      expectedType,
      locallyInferredType,
      expression.range
    );
    assert(
      constraintInferredType.type === 'FunctionType',
      'Should always be inferred as function type!'
    );
    return SourceExpressionLambda({
      range: expression.range,
      type: constraintInferredType,
      associatedComments: expression.associatedComments,
      parameters: expression.parameters,
      captured: Object.fromEntries(captured.entries()),
      body: checkedBody,
    });
  }

  private typeCheckStatementBlock(
    expression: StatementBlockExpression,
    expectedType: SamlangType
  ): SamlangExpression {
    if (expression.block.expression == null) {
      this.constraintAwareTypeChecker.checkAndInfer(expectedType, SourceUnitType, expression.range);
    }
    const checkedStatementBlock = this.statementTypeChecker.typeCheck(
      expression.block,
      expectedType,
      this.localTypingContext
    );
    return {
      ...expression,
      type: checkedStatementBlock.expression?.type ?? SourceUnitType,
      block: checkedStatementBlock,
    };
  }
}

export default function typeCheckExpression(
  expression: SamlangExpression,
  errorCollector: ModuleErrorCollector,
  accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
  localTypingContext: LocalStackedContext<SamlangType>,
  resolution: TypeResolution,
  expectedType: SamlangType
): SamlangExpression {
  const checker = new ExpressionTypeChecker(
    accessibleGlobalTypingContext,
    localTypingContext,
    resolution,
    errorCollector
  );
  const checkedExpression = checker.typeCheck(expression, expectedType);
  if (errorCollector.hasErrors) {
    return checkedExpression;
  }
  return fixExpressionType(checkedExpression, expectedType, resolution);
}
