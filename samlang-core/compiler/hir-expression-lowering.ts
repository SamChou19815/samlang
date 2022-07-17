import {
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  encodeFunctionNameGlobally,
} from '../ast/common-names';
import type { ModuleReference } from '../ast/common-nodes';
import {
  HighIRExpression,
  HighIRFunction,
  HighIRFunctionType,
  HighIRIdentifierType,
  HighIRStatement,
  HighIRType,
  HighIRTypeDefinition,
  HIR_BINARY,
  HIR_BOOL_TYPE,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FALSE,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_INT_TYPE,
  HIR_NAME,
  HIR_STRING_TYPE,
  HIR_STRUCT_INITIALIZATION,
  HIR_TRUE,
  HIR_VARIABLE,
  HIR_ZERO,
} from '../ast/hir-nodes';
import type {
  BinaryExpression,
  ClassMemberExpression,
  FieldAccessExpression,
  FunctionCallExpression,
  IfElseExpression,
  LambdaExpression,
  MatchExpression,
  MethodAccessExpression,
  SamlangExpression,
  SamlangIdentifierType,
  SamlangType,
  StatementBlockExpression,
  UnaryExpression,
} from '../ast/samlang-nodes';
import { assert, checkNotNull, LocalStackedContext, zip } from '../utils';
import type HighIRStringManager from './hir-string-manager';
import {
  collectUsedGenericTypes,
  highIRTypeApplication,
  SamlangTypeLoweringManager,
} from './hir-type-conversion';

type HighIRExpressionLoweringResult = {
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

type HighIRExpressionLoweringResultWithSyntheticFunctions = {
  readonly syntheticFunctions: readonly HighIRFunction[];
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

class HighIRLoweringContext extends LocalStackedContext<HighIRExpression> {
  addLocalValueType(name: string, value: HighIRExpression, onCollision: () => void): void {
    if (value.__type__ !== 'HighIRNameExpression') {
      super.addLocalValueType(name, value, onCollision);
      return;
    }
    super.addLocalValueType(name, this.getLocalValueType(value.name) ?? value, onCollision);
  }

  bind(name: string, value: HighIRExpression): void {
    this.addLocalValueType(name, value, () => {});
  }
}

class HighIRExpressionLoweringManager {
  private nextTemporaryVariableId = 0;

  private nextSyntheticFunctionId = 0;

  depth = 0;
  blockID = 0;

  private readonly varibleContext = new HighIRLoweringContext();

  readonly syntheticFunctions: HighIRFunction[] = [];

  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly encodedFunctionName: string,
    private readonly definedVariables: readonly (readonly [string, HighIRType])[],
    private readonly typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
    private readonly typeLoweringManager: SamlangTypeLoweringManager,
    private readonly stringManager: HighIRStringManager,
  ) {
    definedVariables.forEach(([name, type]) =>
      this.varibleContext.bind(name, HIR_VARIABLE(name, type)),
    );
  }

  private allocateTemporaryVariable(favoredTempVariable: string | null): string {
    if (favoredTempVariable != null) return favoredTempVariable;
    const variableName = `_t${this.nextTemporaryVariableId}`;
    this.nextTemporaryVariableId += 1;
    return variableName;
  }

  private allocateSyntheticFunctionName(): string {
    const functionName = encodeFunctionNameGlobally(
      this.moduleReference,
      this.encodedFunctionName,
      `_Synthetic_${this.nextSyntheticFunctionId}`,
    );
    this.nextSyntheticFunctionId += 1;
    return functionName;
  }

  private loweredAndAddStatements(
    expression: SamlangExpression,
    favoredTempVariable: string | null,
    statements: HighIRStatement[],
  ): HighIRExpression {
    const result = this.lower(expression, favoredTempVariable);
    statements.push(...result.statements);
    return result.expression;
  }

  private getSyntheticIdentifierTypeFromTuple = (
    mappings: readonly HighIRType[],
  ): HighIRIdentifierType => {
    const typeParameters = Array.from(
      collectUsedGenericTypes(
        HIR_FUNCTION_TYPE(mappings, HIR_BOOL_TYPE),
        this.typeLoweringManager.genericTypes,
      ),
    );
    return HIR_IDENTIFIER_TYPE(
      this.typeLoweringManager.typeSynthesizer.synthesizeTupleType(mappings, typeParameters)
        .identifier,
      typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS),
    );
  };

  private getSyntheticIdentifierTypeFromClosure = (
    functionType: HighIRFunctionType,
  ): HighIRIdentifierType => {
    const typeParameters = Array.from(
      collectUsedGenericTypes(functionType, this.typeLoweringManager.genericTypes),
    );
    return HIR_IDENTIFIER_TYPE(
      this.typeLoweringManager.typeSynthesizer.synthesizeClosureType(functionType, typeParameters)
        .identifier,
      typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS),
    );
  };

  private resolveVariable = (variableName: string): HighIRExpression =>
    checkNotNull(
      this.varibleContext.getLocalValueType(variableName),
      `Variable not resolved: ${variableName}`,
    );

  private resolveTypeMappingOfIdentifierType({
    name,
    typeArguments,
  }: HighIRIdentifierType): readonly HighIRType[] {
    const typeDefinition = checkNotNull(this.typeDefinitionMapping[name], `Missing ${name}`);
    const replacementMap = Object.fromEntries(zip(typeDefinition.typeParameters, typeArguments));
    return typeDefinition.mappings.map((type) => highIRTypeApplication(type, replacementMap));
  }

  private getFunctionTypeWithoutContext(type: SamlangType): HighIRFunctionType {
    assert(type.__type__ === 'FunctionType');
    return this.typeLoweringManager.lowerSamlangFunctionTypeForTopLevel(type)[1];
  }

  readonly lower = (
    expression: SamlangExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        switch (expression.literal.type) {
          case 'BoolLiteral':
            return { statements: [], expression: expression.literal.value ? HIR_TRUE : HIR_FALSE };
          case 'IntLiteral':
            return { statements: [], expression: HIR_INT(expression.literal.value) };
          case 'StringLiteral': {
            return {
              statements: [],
              expression: HIR_NAME(
                this.stringManager.allocateStringArrayGlobalVariable(expression.literal.value).name,
                HIR_STRING_TYPE,
              ),
            };
          }
        }
      case 'ThisExpression':
        return { statements: [], expression: this.resolveVariable('_this') };
      case 'VariableExpression':
        return { statements: [], expression: this.resolveVariable(expression.name) };
      case 'ClassMemberExpression':
        return this.lowerClassMember(expression, favoredTempVariable);
      case 'FieldAccessExpression':
        return this.lowerFieldAccess(expression, favoredTempVariable);
      case 'MethodAccessExpression':
        return this.lowerMethodAccess(expression, favoredTempVariable);
      case 'UnaryExpression':
        return this.lowerUnary(expression, favoredTempVariable);
      case 'FunctionCallExpression':
        return this.lowerFunctionCall(expression, favoredTempVariable);
      case 'BinaryExpression':
        return this.lowerBinary(expression, favoredTempVariable);
      case 'IfElseExpression':
        return this.lowerIfElse(expression, favoredTempVariable);
      case 'MatchExpression':
        return this.lowerMatch(expression);
      case 'LambdaExpression':
        return this.lowerLambda(expression, favoredTempVariable);
      case 'StatementBlockExpression':
        return this.lowerStatementBlock(expression, favoredTempVariable);
    }
  };

  private lowerClassMember(
    expression: ClassMemberExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const encodedOriginalFunctionName = encodeFunctionNameGlobally(
      expression.moduleReference,
      expression.className.name,
      expression.memberName.name,
    );
    const originalFunctionType = this.getFunctionTypeWithoutContext(expression.type);
    const closureType = this.getSyntheticIdentifierTypeFromClosure(originalFunctionType);
    const closureVariableName = this.allocateTemporaryVariable(favoredTempVariable);
    const functionType = HIR_FUNCTION_TYPE(
      [HIR_INT_TYPE, ...originalFunctionType.argumentTypes],
      originalFunctionType.returnType,
    );
    const statements: HighIRStatement[] = [
      HIR_CLOSURE_INITIALIZATION({
        closureVariableName,
        closureType,
        functionName: `${encodedOriginalFunctionName}_with_context`,
        functionType,
        context: HIR_ZERO,
      }),
    ];
    const finalVariableExpression = HIR_VARIABLE(closureVariableName, closureType);
    this.varibleContext.bind(closureVariableName, finalVariableExpression);
    return { statements, expression: finalVariableExpression };
  }

  private lowerFieldAccess(
    expression: FieldAccessExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression, null);
    const mappingsForIdentifierType = this.resolveTypeMappingOfIdentifierType(
      result.expression.type as HighIRIdentifierType,
    );
    const extractedFieldType = checkNotNull(mappingsForIdentifierType[expression.fieldOrder]);
    const valueName = this.allocateTemporaryVariable(favoredTempVariable);
    const statements = [
      ...result.statements,
      HIR_INDEX_ACCESS({
        name: valueName,
        type: extractedFieldType,
        pointerExpression: result.expression,
        index: expression.fieldOrder,
      }),
    ];
    this.varibleContext.bind(valueName, HIR_VARIABLE(valueName, extractedFieldType));
    return {
      statements,
      expression: HIR_VARIABLE(valueName, extractedFieldType),
    };
  }

  private lowerMethodAccess(
    expression: MethodAccessExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const functionName = encodeFunctionNameGlobally(
      (expression.expression.type as SamlangIdentifierType).moduleReference,
      (expression.expression.type as SamlangIdentifierType).identifier,
      expression.methodName.name,
    );
    const originalFunctionType = this.getFunctionTypeWithoutContext(expression.type);
    const closureType = this.getSyntheticIdentifierTypeFromClosure(originalFunctionType);
    const closureVariableName = this.allocateTemporaryVariable(favoredTempVariable);
    const result = this.lower(expression.expression, null);
    const methodType = HIR_FUNCTION_TYPE(
      [result.expression.type, ...originalFunctionType.argumentTypes],
      originalFunctionType.returnType,
    );
    const finalVariableExpression = HIR_VARIABLE(closureVariableName, closureType);
    this.varibleContext.bind(closureVariableName, finalVariableExpression);
    return {
      statements: [
        ...result.statements,
        HIR_CLOSURE_INITIALIZATION({
          closureVariableName,
          closureType,
          functionName,
          functionType: methodType,
          context: result.expression,
        }),
      ],
      expression: finalVariableExpression,
    };
  }

  private lowerUnary(
    expression: UnaryExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression, null);
    const valueName = this.allocateTemporaryVariable(favoredTempVariable);
    switch (expression.operator) {
      case '!':
        return {
          statements: [
            ...result.statements,
            HIR_BINARY({ name: valueName, operator: '^', e1: result.expression, e2: HIR_TRUE }),
          ],
          expression: HIR_VARIABLE(valueName, HIR_BOOL_TYPE),
        };
      case '-':
        return {
          statements: [
            ...result.statements,
            HIR_BINARY({ name: valueName, operator: '-', e1: HIR_ZERO, e2: result.expression }),
          ],
          expression: HIR_VARIABLE(valueName, HIR_INT_TYPE),
        };
    }
  }

  private lowerFunctionCall(
    expression: FunctionCallExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const functionExpression = expression.functionExpression;
    const isVoidReturn =
      expression.type.__type__ === 'PrimitiveType' && expression.type.name === 'unit';
    const returnCollectorName = this.allocateTemporaryVariable(favoredTempVariable);
    let functionReturnCollectorType: HighIRType;
    let functionCall: HighIRStatement;
    switch (functionExpression.__type__) {
      case 'ClassMemberExpression': {
        const functionName = encodeFunctionNameGlobally(
          functionExpression.moduleReference,
          functionExpression.className.name,
          functionExpression.memberName.name,
        );
        const functionTypeWithoutContext = this.getFunctionTypeWithoutContext(
          functionExpression.type,
        );
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(functionName, functionTypeWithoutContext),
          functionArguments: expression.functionArguments.map((oneArgument) =>
            this.loweredAndAddStatements(oneArgument, null, loweredStatements),
          ),
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: isVoidReturn ? undefined : returnCollectorName,
        });
        break;
      }
      case 'MethodAccessExpression': {
        const functionName = encodeFunctionNameGlobally(
          (functionExpression.expression.type as SamlangIdentifierType).moduleReference,
          (functionExpression.expression.type as SamlangIdentifierType).identifier,
          functionExpression.methodName.name,
        );
        const functionTypeWithoutContext = this.getFunctionTypeWithoutContext(
          functionExpression.type,
        );
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        const highIRFunctionExpression = this.loweredAndAddStatements(
          functionExpression.expression,
          null,
          loweredStatements,
        );
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            functionName,
            HIR_FUNCTION_TYPE(
              [highIRFunctionExpression.type, ...functionTypeWithoutContext.argumentTypes],
              functionTypeWithoutContext.returnType,
            ),
          ),
          functionArguments: [
            highIRFunctionExpression,
            ...expression.functionArguments.map((oneArgument) =>
              this.loweredAndAddStatements(oneArgument, null, loweredStatements),
            ),
          ],
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: returnCollectorName,
        });
        break;
      }
      default: {
        const loweredFunctionExpression = this.loweredAndAddStatements(
          functionExpression,
          null,
          loweredStatements,
        );
        assert(loweredFunctionExpression.__type__ === 'HighIRVariableExpression');
        assert(functionExpression.type.__type__ === 'FunctionType');
        const returnType = this.typeLoweringManager.lowerSamlangType(
          functionExpression.type.returnType,
        );
        const loweredFunctionArguments = expression.functionArguments.map((oneArgument) =>
          this.loweredAndAddStatements(oneArgument, null, loweredStatements),
        );
        functionReturnCollectorType = returnType;
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: loweredFunctionExpression,
          functionArguments: loweredFunctionArguments,
          returnType,
          returnCollector: isVoidReturn ? undefined : returnCollectorName,
        });
        break;
      }
    }

    loweredStatements.push(functionCall);
    return {
      statements: loweredStatements,
      expression: isVoidReturn
        ? HIR_ZERO
        : HIR_VARIABLE(returnCollectorName, functionReturnCollectorType),
    };
  }

  private shortCircuitBehaviorPreservingBoolExpressionLowering(
    expression: SamlangExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    if (expression.__type__ === 'LiteralExpression' && expression.literal.type === 'BoolLiteral') {
      return { statements: [], expression: expression.literal.value ? HIR_TRUE : HIR_FALSE };
    }
    if (expression.__type__ !== 'BinaryExpression') {
      return this.lower(expression, favoredTempVariable);
    }
    const {
      operator: { symbol: operatorSymbol },
      e1,
      e2,
    } = expression;
    switch (operatorSymbol) {
      case '&&': {
        const temp = this.allocateTemporaryVariable(favoredTempVariable);
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1, null);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2, null);
        if (e1Result.expression.__type__ === 'HighIRIntLiteralExpression') {
          return e1Result.expression.value
            ? {
                statements: [...e1Result.statements, ...e2Result.statements],
                expression: e2Result.expression,
              }
            : { statements: e1Result.statements, expression: HIR_FALSE };
        }
        return {
          statements: [
            ...e1Result.statements,
            HIR_IF_ELSE({
              booleanExpression: e1Result.expression,
              s1: e2Result.statements,
              s2: [],
              finalAssignments: [
                {
                  name: temp,
                  type: HIR_BOOL_TYPE,
                  branch1Value: e2Result.expression,
                  branch2Value: HIR_FALSE,
                },
              ],
            }),
          ],
          expression: HIR_VARIABLE(temp, HIR_BOOL_TYPE),
        };
      }
      case '||': {
        const temp = this.allocateTemporaryVariable(favoredTempVariable);
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1, null);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2, null);
        if (e1Result.expression.__type__ === 'HighIRIntLiteralExpression') {
          return e1Result.expression.value
            ? { statements: e1Result.statements, expression: HIR_TRUE }
            : {
                statements: [...e1Result.statements, ...e2Result.statements],
                expression: e2Result.expression,
              };
        }
        return {
          statements: [
            ...e1Result.statements,
            HIR_IF_ELSE({
              booleanExpression: e1Result.expression,
              s1: [],
              s2: e2Result.statements,
              finalAssignments: [
                {
                  name: temp,
                  type: HIR_BOOL_TYPE,
                  branch1Value: HIR_TRUE,
                  branch2Value: e2Result.expression,
                },
              ],
            }),
          ],
          expression: HIR_VARIABLE(temp, HIR_BOOL_TYPE),
        };
      }
      case '::': {
        if (
          expression.e1.__type__ === 'LiteralExpression' &&
          expression.e1.literal.type === 'StringLiteral' &&
          expression.e2.__type__ === 'LiteralExpression' &&
          expression.e2.literal.type === 'StringLiteral'
        ) {
          return {
            statements: [],
            expression: HIR_NAME(
              this.stringManager.allocateStringArrayGlobalVariable(
                expression.e1.literal.value + expression.e2.literal.value,
              ).name,
              HIR_STRING_TYPE,
            ),
          };
        }
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, null, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, null, loweredStatements);
        const returnCollectorName = this.allocateTemporaryVariable(favoredTempVariable);
        loweredStatements.push(
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              ENCODED_FUNCTION_NAME_STRING_CONCAT,
              HIR_FUNCTION_TYPE([HIR_STRING_TYPE, HIR_STRING_TYPE], HIR_STRING_TYPE),
            ),
            functionArguments: [loweredE1, loweredE2],
            returnType: HIR_STRING_TYPE,
            returnCollector: returnCollectorName,
          }),
        );
        return {
          statements: loweredStatements,
          expression: HIR_VARIABLE(returnCollectorName, HIR_STRING_TYPE),
        };
      }
      default: {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1Original = this.loweredAndAddStatements(
          expression.e1,
          null,
          loweredStatements,
        );
        const loweredE2Original = this.loweredAndAddStatements(
          expression.e2,
          null,
          loweredStatements,
        );
        const valueTemp = this.allocateTemporaryVariable(favoredTempVariable);
        const binaryStatement = HIR_BINARY({
          name: valueTemp,
          operator: operatorSymbol,
          e1: loweredE1Original,
          e2: loweredE2Original,
        });
        loweredStatements.push(binaryStatement);
        return {
          statements: loweredStatements,
          expression: HIR_VARIABLE(valueTemp, binaryStatement.type),
        };
      }
    }
  }

  private lowerBinary(
    expression: BinaryExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    return this.shortCircuitBehaviorPreservingBoolExpressionLowering(
      expression,
      favoredTempVariable,
    );
  }

  private lowerIfElse(
    expression: IfElseExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredBoolExpression = this.loweredAndAddStatements(
      expression.boolExpression,
      null,
      loweredStatements,
    );
    const e1LoweringResult = this.lower(expression.e1, null);
    const e2LoweringResult = this.lower(expression.e2, null);
    const variableForIfElseAssign = this.allocateTemporaryVariable(favoredTempVariable);
    const loweredReturnType = e1LoweringResult.expression.type;
    loweredStatements.push(
      HIR_IF_ELSE({
        booleanExpression: loweredBoolExpression,
        s1: e1LoweringResult.statements,
        s2: e2LoweringResult.statements,
        finalAssignments: [
          {
            name: variableForIfElseAssign,
            type: loweredReturnType,
            branch1Value: e1LoweringResult.expression,
            branch2Value: e2LoweringResult.expression,
          },
        ],
      }),
    );
    const finalVariable = HIR_VARIABLE(variableForIfElseAssign, loweredReturnType);
    this.varibleContext.bind(variableForIfElseAssign, finalVariable);
    return { statements: loweredStatements, expression: finalVariable };
  }

  private lowerMatch(expression: MatchExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const matchedExpression = this.loweredAndAddStatements(
      expression.matchedExpression,
      null,
      loweredStatements,
    );
    assert(matchedExpression.type.__type__ === 'IdentifierType');
    const matchedExpressionTypeMapping = this.resolveTypeMappingOfIdentifierType(
      matchedExpression.type,
    );
    const variableForTag = this.allocateTemporaryVariable(null);
    loweredStatements.push(
      HIR_INDEX_ACCESS({
        name: variableForTag,
        type: HIR_INT_TYPE,
        pointerExpression: matchedExpression,
        index: 0,
      }),
    );
    this.varibleContext.bind(variableForTag, HIR_VARIABLE(variableForTag, HIR_INT_TYPE));
    const loweredMatchingList = expression.matchingList.map(
      ({ tagOrder, dataVariable, expression: patternExpression }) => {
        const localStatements: HighIRStatement[] = [];
        return this.varibleContext.withNestedScope(() => {
          if (dataVariable != null) {
            const [{ name: dataVariableName }] = dataVariable;
            const dataVariableType = checkNotNull(matchedExpressionTypeMapping[tagOrder]);
            localStatements.push(
              HIR_INDEX_ACCESS({
                name: dataVariableName,
                type: dataVariableType,
                pointerExpression: matchedExpression,
                index: 1,
              }),
            );
            this.varibleContext.bind(
              dataVariableName,
              HIR_VARIABLE(dataVariableName, dataVariableType),
            );
          }
          const result = this.lower(patternExpression, null);
          localStatements.push(...result.statements);
          const finalExpression = result.expression;
          return { tagOrder, finalExpression, statements: localStatements };
        });
      },
    );
    const lastCase = checkNotNull(loweredMatchingList[loweredMatchingList.length - 1]);
    const { s: chainedStatements, e: finalValue } = loweredMatchingList
      .slice(0, loweredMatchingList.length - 1)
      .reduceRight(
        (acc, oneCase) => {
          const comparisonTemporary = this.allocateTemporaryVariable(null);
          const finalAssignmentTemporary = this.allocateTemporaryVariable(null);
          const loweredReturnType = acc.e.type;
          return {
            s: [
              HIR_BINARY({
                name: comparisonTemporary,
                operator: '==',
                e1: HIR_VARIABLE(variableForTag, HIR_INT_TYPE),
                e2: HIR_INT(oneCase.tagOrder),
              }),
              HIR_IF_ELSE({
                booleanExpression: HIR_VARIABLE(comparisonTemporary, HIR_BOOL_TYPE),
                s1: oneCase.statements,
                s2: acc.s,
                finalAssignments: [
                  {
                    name: finalAssignmentTemporary,
                    type: loweredReturnType,
                    branch1Value: oneCase.finalExpression,
                    branch2Value: acc.e,
                  },
                ],
              }),
            ],
            e: HIR_VARIABLE(finalAssignmentTemporary, loweredReturnType),
          };
        },
        { s: lastCase.statements, e: checkNotNull(lastCase.finalExpression) },
      );
    loweredStatements.push(...chainedStatements);

    return { statements: loweredStatements, expression: finalValue };
  }

  private lowerLambda(
    expression: LambdaExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const captured = Object.keys(expression.captured).map(
      (name) => [name, this.resolveVariable(name)] as const,
    );

    const loweredStatements: HighIRStatement[] = [];
    const closureVariableName = this.allocateTemporaryVariable(favoredTempVariable);
    let context: HighIRExpression;
    if (captured.length === 0) {
      context = HIR_ZERO;
    } else {
      const contextName = this.allocateTemporaryVariable(null);
      const contextType = this.getSyntheticIdentifierTypeFromTuple(
        captured.map(([, variable]) => variable.type),
      );
      loweredStatements.push(
        HIR_STRUCT_INITIALIZATION({
          structVariableName: contextName,
          type: contextType,
          expressionList: captured.map(([, variable]) => variable),
        }),
      );
      context = HIR_VARIABLE(contextName, contextType);
      this.varibleContext.bind(contextName, context);
    }
    const syntheticLambda = this.createSyntheticLambdaFunction(expression, captured, context.type);
    this.syntheticFunctions.push(syntheticLambda);
    const closureType = this.getSyntheticIdentifierTypeFromClosure(
      HIR_FUNCTION_TYPE(
        syntheticLambda.type.argumentTypes.slice(1),
        syntheticLambda.type.returnType,
      ),
    );
    loweredStatements.push(
      HIR_CLOSURE_INITIALIZATION({
        closureVariableName,
        closureType,
        functionName: syntheticLambda.name,
        functionType: syntheticLambda.type,
        context,
      }),
    );
    const finalLambdaVariable = HIR_VARIABLE(closureVariableName, closureType);
    this.varibleContext.bind(closureVariableName, finalLambdaVariable);
    return { statements: loweredStatements, expression: finalLambdaVariable };
  }

  private createSyntheticLambdaFunction(
    expression: LambdaExpression,
    captured: readonly (readonly [string, HighIRExpression])[],
    contextType: HighIRType,
  ): HighIRFunction {
    const lambdaStatements: HighIRStatement[] = [];
    captured.forEach(([variableName, { type }], index) => {
      lambdaStatements.push(
        HIR_INDEX_ACCESS({
          name: variableName,
          type,
          pointerExpression: HIR_VARIABLE('_context', contextType),
          index,
        }),
      );
    });

    const parameters = expression.parameters.map(({ name }) => name);
    const [typeParameters, functionTypeWithoutContext] =
      this.typeLoweringManager.lowerSamlangFunctionTypeForTopLevel({
        __type__: 'FunctionType',
        argumentTypes: expression.type.argumentTypes,
        returnType: expression.type.returnType,
      });
    const functionName = this.allocateSyntheticFunctionName();
    const loweringResult = new HighIRExpressionLoweringManager(
      this.moduleReference,
      functionName,
      [
        ...zip(
          parameters.map((it) => it.name),
          functionTypeWithoutContext.argumentTypes,
        ),
        ...this.definedVariables,
        ...captured.map(([variableName, { type }]) => [variableName, type] as const),
      ],
      this.typeDefinitionMapping,
      this.typeLoweringManager,
      this.stringManager,
    ).lower(expression.body, null);
    lambdaStatements.push(...loweringResult.statements);
    return {
      name: functionName,
      typeParameters,
      parameters: ['_context', ...expression.parameters.map(({ name: { name } }) => name)],
      type: HIR_FUNCTION_TYPE(
        [contextType, ...functionTypeWithoutContext.argumentTypes],
        functionTypeWithoutContext.returnType,
      ),
      body: lambdaStatements,
      returnValue: loweringResult.expression,
    };
  }

  private lowerStatementBlock(
    expression: StatementBlockExpression,
    favoredTempVariable: string | null,
  ): HighIRExpressionLoweringResult {
    const {
      block: { statements: blockStatements, expression: finalExpression },
    } = expression;
    const loweredStatements: HighIRStatement[] = [];
    this.depth += 1;
    const loweredFinalExpression = this.varibleContext.withNestedScope(() => {
      blockStatements.forEach(({ pattern, assignedExpression }) => {
        switch (pattern.type) {
          case 'ObjectPattern': {
            const loweredAssignedExpression = this.loweredAndAddStatements(
              assignedExpression,
              null,
              loweredStatements,
            );
            const identifierType = loweredAssignedExpression.type;
            assert(identifierType.__type__ === 'IdentifierType');
            pattern.destructedNames.forEach(({ fieldName, fieldOrder, alias }) => {
              const fieldType = checkNotNull(
                this.resolveTypeMappingOfIdentifierType(identifierType)[fieldOrder],
              );
              const mangledName = this.getRenamedVariableForNesting(
                (alias ?? fieldName).name,
                fieldType,
              );
              loweredStatements.push(
                HIR_INDEX_ACCESS({
                  name: mangledName,
                  type: fieldType,
                  pointerExpression: loweredAssignedExpression,
                  index: fieldOrder,
                }),
              );
              this.varibleContext.bind(mangledName, HIR_VARIABLE(mangledName, fieldType));
            });
            break;
          }
          case 'VariablePattern': {
            const loweredAssignedExpression = this.loweredAndAddStatements(
              assignedExpression,
              pattern.name,
              loweredStatements,
            );
            this.varibleContext.bind(pattern.name, loweredAssignedExpression);
            break;
          }
          case 'WildCardPattern':
            this.loweredAndAddStatements(assignedExpression, null, loweredStatements);
            break;
        }
      });
      if (finalExpression == null) return HIR_ZERO;
      return this.loweredAndAddStatements(finalExpression, favoredTempVariable, loweredStatements);
    });
    this.blockID += 1;
    this.depth -= 1;
    return { statements: loweredStatements, expression: loweredFinalExpression };
  }

  private getRenamedVariableForNesting = (name: string, type: HighIRType): string => {
    if (this.depth === 0) {
      return name;
    }
    const renamed = `${name}__depth_${this.depth}__block_${this.blockID}`;
    this.varibleContext.bind(name, HIR_VARIABLE(renamed, type));
    return renamed;
  };
}

export default function lowerSamlangExpression(
  moduleReference: ModuleReference,
  encodedFunctionName: string,
  definedVariables: readonly (readonly [string, HighIRType])[],
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  typeLoweringManager: SamlangTypeLoweringManager,
  stringManager: HighIRStringManager,
  expression: SamlangExpression,
): HighIRExpressionLoweringResultWithSyntheticFunctions {
  const manager = new HighIRExpressionLoweringManager(
    moduleReference,
    encodedFunctionName,
    definedVariables,
    typeDefinitionMapping,
    typeLoweringManager,
    stringManager,
  );
  if (expression.__type__ === 'StatementBlockExpression') manager.depth = -1;
  const result = manager.lower(expression, null);
  return { ...result, syntheticFunctions: manager.syntheticFunctions };
}
