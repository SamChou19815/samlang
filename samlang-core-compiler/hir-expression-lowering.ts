import {
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  encodeFunctionNameGlobally,
} from 'samlang-core-ast/common-names';
import type { ModuleReference, Type, IdentifierType } from 'samlang-core-ast/common-nodes';
import {
  HighIRType,
  HighIRFunctionType,
  HighIRTypeDefinition,
  HighIRExpression,
  HighIRStatement,
  HighIRFunction,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_TRUE,
  HIR_FALSE,
  HIR_ZERO,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_STRUCT_INITIALIZATION,
  HighIRIdentifierType,
} from 'samlang-core-ast/hir-nodes';
import type {
  SamlangExpression,
  ClassMemberExpression,
  TupleConstructorExpression,
  ObjectConstructorExpression,
  VariantConstructorExpression,
  FieldAccessExpression,
  MethodAccessExpression,
  UnaryExpression,
  FunctionCallExpression,
  BinaryExpression,
  IfElseExpression,
  MatchExpression,
  LambdaExpression,
  StatementBlockExpression,
} from 'samlang-core-ast/samlang-expressions';
import { LocalStackedContext, assert, checkNotNull, zip } from 'samlang-core-utils';

import type HighIRStringManager from './hir-string-manager';
import {
  highIRTypeApplication,
  HighIRTypeSynthesizer,
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
    definedVariables: readonly (readonly [string, HighIRType])[],
    private readonly typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
    private readonly functionTypeMapping: Readonly<Record<string, HighIRFunctionType>>,
    private readonly thisType: HighIRType | null,
    private readonly typeLoweringManager: SamlangTypeLoweringManager,
    private readonly typeSynthesizer: HighIRTypeSynthesizer,
    private readonly stringManager: HighIRStringManager
  ) {
    definedVariables.forEach(([name, type]) => {
      this.varibleContext.bind(name, HIR_VARIABLE(name, type));
    });
  }

  private allocateTemporaryVariable(): string {
    const variableName = `_t${this.nextTemporaryVariableId}`;
    this.nextTemporaryVariableId += 1;
    return variableName;
  }

  private allocateSyntheticFunctionName(): string {
    const functionName = encodeFunctionNameGlobally(
      this.moduleReference,
      this.encodedFunctionName,
      `_Synthetic_${this.nextSyntheticFunctionId}`
    );
    this.nextSyntheticFunctionId += 1;
    return functionName;
  }

  private loweredAndAddStatements(
    expression: SamlangExpression,
    statements: HighIRStatement[]
  ): HighIRExpression {
    const result = this.lower(expression);
    statements.push(...result.statements);
    return result.expression;
  }

  // TODO: avoid calling this most of the time
  private lowerType = (type: Type): HighIRType => this.typeLoweringManager.lowerSamlangType(type);

  private getSyntheticIdentifierTypeFromTuple = (
    mappings: readonly HighIRType[]
  ): HighIRIdentifierType =>
    HIR_IDENTIFIER_TYPE(this.typeSynthesizer.synthesizeTupleType(mappings, []).identifier, []);

  private resolveTypeMappingOfIdentifierType({
    name,
    typeArguments,
  }: HighIRIdentifierType): readonly HighIRType[] {
    const typeDefinition = checkNotNull(
      this.typeDefinitionMapping[name] ?? this.typeSynthesizer.mappings.get(name)
    );
    const replacementMap = Object.fromEntries(zip(typeDefinition.typeParameters, typeArguments));
    return typeDefinition.mappings.map((type) => highIRTypeApplication(type, replacementMap));
  }

  readonly lower = (expression: SamlangExpression): HighIRExpressionLoweringResult => {
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
                HIR_STRING_TYPE
              ),
            };
          }
        }
      case 'ThisExpression':
        return { statements: [], expression: HIR_VARIABLE('_this', checkNotNull(this.thisType)) };
      case 'VariableExpression': {
        const stored = this.varibleContext.getLocalValueType(expression.name);
        if (stored == null) {
          return {
            statements: [],
            expression: HIR_VARIABLE(expression.name, this.lowerType(expression.type)),
          };
        }
        return { statements: [], expression: stored };
      }
      case 'ClassMemberExpression':
        return this.lowerClassMember(expression);
      case 'TupleConstructorExpression':
        return this.lowerTupleConstructor(expression);
      case 'ObjectConstructorExpression':
        return this.lowerObjectConstructor(expression);
      case 'VariantConstructorExpression':
        return this.lowerVariantConstructor(expression);
      case 'FieldAccessExpression':
        return this.lowerFieldAccess(expression);
      case 'MethodAccessExpression':
        return this.lowerMethodAccess(expression);
      case 'UnaryExpression':
        return this.lowerUnary(expression);
      case 'FunctionCallExpression':
        return this.lowerFunctionCall(expression);
      case 'BinaryExpression':
        return this.lowerBinary(expression);
      case 'IfElseExpression':
        return this.lowerIfElse(expression);
      case 'MatchExpression':
        return this.lowerMatch(expression);
      case 'LambdaExpression':
        return this.lowerLambda(expression);
      case 'StatementBlockExpression':
        return this.lowerStatementBlock(expression);
    }
  };

  private lowerClassMember(expression: ClassMemberExpression): HighIRExpressionLoweringResult {
    const encodedOriginalFunctionName = encodeFunctionNameGlobally(
      expression.moduleReference,
      expression.className,
      expression.memberName
    );
    const functionTypeWithoutContext = this.functionTypeMapping[encodedOriginalFunctionName];
    assert(functionTypeWithoutContext != null, `Missing function: ${encodedOriginalFunctionName}`);
    const structVariableName = this.allocateTemporaryVariable();
    const withContextIRFunctionType = HIR_FUNCTION_TYPE(
      [HIR_INT_TYPE, ...functionTypeWithoutContext.argumentTypes],
      functionTypeWithoutContext.returnType
    );
    const closureType = this.getSyntheticIdentifierTypeFromTuple([
      withContextIRFunctionType,
      HIR_INT_TYPE,
    ]);
    const statements: HighIRStatement[] = [];
    statements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: closureType,
        expressionList: [
          HIR_NAME(`${encodedOriginalFunctionName}_with_context`, withContextIRFunctionType),
          HIR_ZERO,
        ],
      })
    );
    const finalVariableExpression = HIR_VARIABLE(structVariableName, closureType);
    this.varibleContext.bind(structVariableName, finalVariableExpression);
    return { statements, expression: finalVariableExpression };
  }

  private lowerTupleConstructor(
    expression: TupleConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const tupleVariableName = this.allocateTemporaryVariable();
    const loweredExpressions = expression.expressions.map((subExpression) =>
      this.loweredAndAddStatements(subExpression, loweredStatements)
    );
    const loweredTupleIdentifierType = this.getSyntheticIdentifierTypeFromTuple(
      loweredExpressions.map((it) => it.type)
    );
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName: tupleVariableName,
        type: loweredTupleIdentifierType,
        expressionList: loweredExpressions,
      })
    );
    const finalVariableExpression = HIR_VARIABLE(tupleVariableName, loweredTupleIdentifierType);
    this.varibleContext.bind(tupleVariableName, finalVariableExpression);
    return { statements: loweredStatements, expression: finalVariableExpression };
  }

  private lowerObjectConstructor(
    expression: ObjectConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredFields = expression.fieldDeclarations.map((fieldDeclaration) => {
      const fieldExpression = fieldDeclaration.expression ?? {
        __type__: 'VariableExpression',
        range: fieldDeclaration.range,
        precedence: 1,
        associatedComments: [],
        type: fieldDeclaration.type,
        name: fieldDeclaration.name,
      };
      return this.loweredAndAddStatements(fieldExpression, loweredStatements);
    });
    const structVariableName = this.allocateTemporaryVariable();
    const loweredIdentifierType = this.lowerType(expression.type);
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: loweredIdentifierType,
        expressionList: loweredFields,
      })
    );
    const finalVariable = HIR_VARIABLE(structVariableName, loweredIdentifierType);
    this.varibleContext.bind(structVariableName, finalVariable);
    return { statements: loweredStatements, expression: finalVariable };
  }

  private lowerVariantConstructor(
    expression: VariantConstructorExpression
  ): HighIRExpressionLoweringResult {
    const structVariableName = this.allocateTemporaryVariable();
    const statements: HighIRStatement[] = [];
    const variantType = this.lowerType(expression.type);
    const dataExpression = this.loweredAndAddStatements(expression.data, statements);
    statements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: variantType,
        expressionList: [HIR_INT(expression.tagOrder), dataExpression],
      })
    );
    const finalVariable = HIR_VARIABLE(structVariableName, variantType);
    this.varibleContext.bind(structVariableName, finalVariable);
    return { statements, expression: finalVariable };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const mappingsForIdentifierType = this.resolveTypeMappingOfIdentifierType(
      result.expression.type as HighIRIdentifierType
    );
    const extractedFieldType = checkNotNull(mappingsForIdentifierType[expression.fieldOrder]);
    const valueName = this.allocateTemporaryVariable();
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

  private lowerMethodAccess(expression: MethodAccessExpression): HighIRExpressionLoweringResult {
    const functionName = encodeFunctionNameGlobally(
      (expression.expression.type as IdentifierType).moduleReference,
      (expression.expression.type as IdentifierType).identifier,
      expression.methodName
    );
    const functionTypeWithoutContext = this.functionTypeMapping[functionName];
    assert(functionTypeWithoutContext != null, `Missing function: ${functionName}`);
    const structVariableName = this.allocateTemporaryVariable();
    const result = this.lower(expression.expression);
    const methodType = HIR_FUNCTION_TYPE(
      [result.expression.type, ...functionTypeWithoutContext.argumentTypes],
      functionTypeWithoutContext.returnType
    );
    const closureType = this.getSyntheticIdentifierTypeFromTuple([
      methodType,
      result.expression.type,
    ]);
    const finalVariableExpression = HIR_VARIABLE(structVariableName, closureType);
    this.varibleContext.bind(structVariableName, finalVariableExpression);
    return {
      statements: [
        ...result.statements,
        HIR_STRUCT_INITIALIZATION({
          structVariableName,
          type: closureType,
          expressionList: [HIR_NAME(functionName, methodType), result.expression],
        }),
      ],
      expression: finalVariableExpression,
    };
  }

  private lowerUnary(expression: UnaryExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const valueName = this.allocateTemporaryVariable();
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

  private lowerFunctionCall(expression: FunctionCallExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const functionExpression = expression.functionExpression;
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const returnCollectorName = this.allocateTemporaryVariable();
    let functionReturnCollectorType: HighIRType;
    let functionCall: HighIRStatement;
    switch (functionExpression.__type__) {
      case 'ClassMemberExpression': {
        const functionName = encodeFunctionNameGlobally(
          functionExpression.moduleReference,
          functionExpression.className,
          functionExpression.memberName
        );
        const functionTypeWithoutContext = this.functionTypeMapping[functionName];
        assert(functionTypeWithoutContext != null, `Missing function: ${functionName}`);
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(functionName, functionTypeWithoutContext),
          functionArguments: expression.functionArguments.map((oneArgument) =>
            this.loweredAndAddStatements(oneArgument, loweredStatements)
          ),
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: isVoidReturn ? undefined : returnCollectorName,
        });
        break;
      }
      case 'MethodAccessExpression': {
        const functionName = encodeFunctionNameGlobally(
          (functionExpression.expression.type as IdentifierType).moduleReference,
          (functionExpression.expression.type as IdentifierType).identifier,
          functionExpression.methodName
        );
        const functionTypeWithoutContext = checkNotNull(this.functionTypeMapping[functionName]);
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        const highIRFunctionExpression = this.loweredAndAddStatements(
          functionExpression.expression,
          loweredStatements
        );
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            functionName,
            HIR_FUNCTION_TYPE(
              [highIRFunctionExpression.type, ...functionTypeWithoutContext.argumentTypes],
              functionTypeWithoutContext.returnType
            )
          ),
          functionArguments: [
            highIRFunctionExpression,
            ...expression.functionArguments.map((oneArgument) =>
              this.loweredAndAddStatements(oneArgument, loweredStatements)
            ),
          ],
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: returnCollectorName,
        });
        break;
      }
      default: {
        const pointerExpression = this.loweredAndAddStatements(
          functionExpression,
          loweredStatements
        );
        const closureType = pointerExpression.type;
        assert(closureType.__type__ === 'IdentifierType');
        const [functionType, contextType] = this.resolveTypeMappingOfIdentifierType(
          closureType
        ) as readonly [HighIRType, HighIRType];
        assert(functionType.__type__ === 'FunctionType');
        const loweredFunctionArguments = expression.functionArguments.map((oneArgument) =>
          this.loweredAndAddStatements(oneArgument, loweredStatements)
        );
        const functionTemp = this.allocateTemporaryVariable();
        const contextTemp = this.allocateTemporaryVariable();
        loweredStatements.push(
          HIR_INDEX_ACCESS({ name: functionTemp, type: functionType, pointerExpression, index: 0 }),
          HIR_INDEX_ACCESS({ name: contextTemp, type: contextType, pointerExpression, index: 1 })
        );
        const functionTempVariable = HIR_VARIABLE(functionTemp, functionType);
        const contextTempVariable = HIR_VARIABLE(contextTemp, contextType);
        this.varibleContext.bind(functionTemp, functionTempVariable);
        this.varibleContext.bind(contextTemp, contextTempVariable);

        functionReturnCollectorType = functionType.returnType;
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: functionTempVariable,
          functionArguments: [contextTempVariable, ...loweredFunctionArguments],
          returnType: functionType.returnType,
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
    expression: SamlangExpression
  ): HighIRExpressionLoweringResult {
    if (expression.__type__ === 'LiteralExpression' && expression.literal.type === 'BoolLiteral') {
      return { statements: [], expression: expression.literal.value ? HIR_TRUE : HIR_FALSE };
    }
    if (expression.__type__ !== 'BinaryExpression') {
      return this.lower(expression);
    }
    const {
      operator: { symbol: operatorSymbol },
      e1,
      e2,
    } = expression;
    switch (operatorSymbol) {
      case '&&': {
        const temp = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
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
        const temp = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
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
                expression.e1.literal.value + expression.e2.literal.value
              ).name,
              HIR_STRING_TYPE
            ),
          };
        }
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const returnCollectorName = this.allocateTemporaryVariable();
        loweredStatements.push(
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              ENCODED_FUNCTION_NAME_STRING_CONCAT,
              HIR_FUNCTION_TYPE([HIR_STRING_TYPE, HIR_STRING_TYPE], HIR_STRING_TYPE)
            ),
            functionArguments: [loweredE1, loweredE2],
            returnType: HIR_STRING_TYPE,
            returnCollector: returnCollectorName,
          })
        );
        return {
          statements: loweredStatements,
          expression: HIR_VARIABLE(returnCollectorName, HIR_STRING_TYPE),
        };
      }
      default: {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1Original = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2Original = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const valueTemp = this.allocateTemporaryVariable();
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

  private lowerBinary(expression: BinaryExpression): HighIRExpressionLoweringResult {
    return this.shortCircuitBehaviorPreservingBoolExpressionLowering(expression);
  }

  private lowerIfElse(expression: IfElseExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const loweredBoolExpression = this.loweredAndAddStatements(
      expression.boolExpression,
      loweredStatements
    );
    const e1LoweringResult = this.lower(expression.e1);
    const e2LoweringResult = this.lower(expression.e2);
    const variableForIfElseAssign = this.allocateTemporaryVariable();
    if (isVoidReturn) {
      loweredStatements.push(
        HIR_IF_ELSE({
          booleanExpression: loweredBoolExpression,
          s1: e1LoweringResult.statements,
          s2: e2LoweringResult.statements,
          finalAssignments: [],
        })
      );
      return { statements: loweredStatements, expression: HIR_ZERO };
    }
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
      })
    );
    const finalVariable = HIR_VARIABLE(variableForIfElseAssign, loweredReturnType);
    this.varibleContext.bind(variableForIfElseAssign, finalVariable);
    return { statements: loweredStatements, expression: finalVariable };
  }

  private lowerMatch(expression: MatchExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const matchedExpression = this.loweredAndAddStatements(
      expression.matchedExpression,
      loweredStatements
    );
    assert(matchedExpression.type.__type__ === 'IdentifierType');
    const matchedExpressionTypeMapping = this.resolveTypeMappingOfIdentifierType(
      matchedExpression.type
    );
    const variableForTag = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_INDEX_ACCESS({
        name: variableForTag,
        type: HIR_INT_TYPE,
        pointerExpression: matchedExpression,
        index: 0,
      })
    );
    this.varibleContext.bind(variableForTag, HIR_VARIABLE(variableForTag, HIR_INT_TYPE));
    const loweredMatchingList = expression.matchingList.map(
      ({ tagOrder, dataVariable, expression: patternExpression }) => {
        const localStatements: HighIRStatement[] = [];
        return this.varibleContext.withNestedScope(() => {
          if (dataVariable != null) {
            const [dataVariableName] = dataVariable;
            const dataVariableType = checkNotNull(matchedExpressionTypeMapping[tagOrder]);
            localStatements.push(
              HIR_INDEX_ACCESS({
                name: dataVariableName,
                type: dataVariableType,
                pointerExpression: matchedExpression,
                index: 1,
              })
            );
            this.varibleContext.bind(
              dataVariableName,
              HIR_VARIABLE(dataVariableName, dataVariableType)
            );
          }
          const result = this.lower(patternExpression);
          localStatements.push(...result.statements);
          const finalExpression = isVoidReturn ? undefined : result.expression;
          return { tagOrder, finalExpression, statements: localStatements };
        });
      }
    );
    const lastCase = checkNotNull(loweredMatchingList[loweredMatchingList.length - 1]);
    let finalExpression: HighIRExpression;
    if (isVoidReturn) {
      loweredStatements.push(
        ...loweredMatchingList
          .slice(0, loweredMatchingList.length - 1)
          .reduceRight((acc, oneCase) => {
            const comparisonTemporary = this.allocateTemporaryVariable();
            return [
              HIR_BINARY({
                name: comparisonTemporary,
                operator: '==',
                e1: HIR_VARIABLE(variableForTag, HIR_INT_TYPE),
                e2: HIR_INT(oneCase.tagOrder),
              }),
              HIR_IF_ELSE({
                booleanExpression: HIR_VARIABLE(comparisonTemporary, HIR_BOOL_TYPE),
                s1: oneCase.statements,
                s2: acc,
                finalAssignments: [],
              }),
            ];
          }, lastCase.statements)
      );
      finalExpression = HIR_ZERO;
    } else {
      const { s: chainedStatements, e: finalValue } = loweredMatchingList
        .slice(0, loweredMatchingList.length - 1)
        .reduceRight(
          (acc, oneCase) => {
            const comparisonTemporary = this.allocateTemporaryVariable();
            const finalAssignmentTemporary = this.allocateTemporaryVariable();
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
                      branch1Value: checkNotNull(oneCase.finalExpression),
                      branch2Value: acc.e,
                    },
                  ],
                }),
              ],
              e: HIR_VARIABLE(finalAssignmentTemporary, loweredReturnType),
            };
          },
          { s: lastCase.statements, e: checkNotNull(lastCase.finalExpression) }
        );
      loweredStatements.push(...chainedStatements);
      finalExpression = finalValue;
    }

    return { statements: loweredStatements, expression: finalExpression };
  }

  private lowerLambda(expression: LambdaExpression): HighIRExpressionLoweringResult {
    const syntheticLambda = this.createSyntheticLambdaFunction(expression);
    this.syntheticFunctions.push(syntheticLambda);

    const captured = Object.entries(expression.captured);
    const loweredStatements: HighIRStatement[] = [];
    const structVariableName = this.allocateTemporaryVariable();
    let context: HighIRExpression;
    if (captured.length === 0) {
      context = HIR_ZERO;
    } else {
      const contextName = this.allocateTemporaryVariable();
      const expressionList = captured.map(([variableName, variableType]) =>
        HIR_VARIABLE(variableName, this.lowerType(variableType))
      );
      const contextType = this.getSyntheticIdentifierTypeFromTuple(
        expressionList.map((it) => it.type)
      );
      loweredStatements.push(
        HIR_STRUCT_INITIALIZATION({
          structVariableName: contextName,
          type: contextType,
          expressionList,
        })
      );
      context = HIR_VARIABLE(contextName, contextType);
      this.varibleContext.bind(contextName, context);
    }
    const closureType = this.getSyntheticIdentifierTypeFromTuple([
      syntheticLambda.type,
      context.type,
    ]);
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: closureType,
        expressionList: [HIR_NAME(syntheticLambda.name, syntheticLambda.type), context],
      })
    );
    const finalLambdaVariable = HIR_VARIABLE(structVariableName, closureType);
    this.varibleContext.bind(structVariableName, finalLambdaVariable);
    return { statements: loweredStatements, expression: finalLambdaVariable };
  }

  private createSyntheticLambdaFunction(expression: LambdaExpression): HighIRFunction {
    const loweringResult = this.lower(expression.body);
    const lambdaStatements: HighIRStatement[] = [];
    const contextType = HIR_IDENTIFIER_TYPE(
      this.typeSynthesizer.synthesizeTupleType(
        Object.values(expression.captured).map((it) => this.lowerType(it)),
        []
      ).identifier,
      []
    );
    Object.entries(expression.captured).forEach(([variable, variableType], index) => {
      lambdaStatements.push(
        HIR_INDEX_ACCESS({
          name: variable,
          type: this.lowerType(variableType),
          pointerExpression: HIR_VARIABLE('_context', contextType),
          index,
        })
      );
    });
    lambdaStatements.push(...loweringResult.statements);
    return {
      name: this.allocateSyntheticFunctionName(),
      typeParameters: [],
      parameters: ['_context', ...expression.parameters.map(([name]) => name)],
      type: HIR_FUNCTION_TYPE(
        [contextType, ...expression.parameters.map(([, , type]) => this.lowerType(type))],
        this.lowerType(expression.type.returnType)
      ),
      body: lambdaStatements,
      returnValue: loweringResult.expression,
    };
  }

  private lowerStatementBlock(
    expression: StatementBlockExpression
  ): HighIRExpressionLoweringResult {
    const {
      block: { statements: blockStatements, expression: finalExpression },
    } = expression;
    const loweredStatements: HighIRStatement[] = [];
    this.depth += 1;
    const loweredFinalExpression = this.varibleContext.withNestedScope(() => {
      blockStatements.forEach(({ pattern, assignedExpression }) => {
        const loweredAssignedExpression = this.loweredAndAddStatements(
          assignedExpression,
          loweredStatements
        );
        switch (pattern.type) {
          case 'TuplePattern': {
            const identifierType = loweredAssignedExpression.type;
            assert(identifierType.__type__ === 'IdentifierType');
            pattern.destructedNames.forEach(({ name }, index) => {
              if (name == null) return;
              const fieldType = checkNotNull(
                this.resolveTypeMappingOfIdentifierType(identifierType)[index]
              );
              const mangledName = this.getRenamedVariableForNesting(name, fieldType);
              loweredStatements.push(
                HIR_INDEX_ACCESS({
                  name: mangledName,
                  type: fieldType,
                  pointerExpression: loweredAssignedExpression,
                  index,
                })
              );
              this.varibleContext.bind(mangledName, HIR_VARIABLE(mangledName, fieldType));
            });
            break;
          }
          case 'ObjectPattern': {
            const identifierType = loweredAssignedExpression.type;
            assert(identifierType.__type__ === 'IdentifierType');
            pattern.destructedNames.forEach(({ fieldName, fieldOrder, alias }) => {
              const fieldType = checkNotNull(
                this.resolveTypeMappingOfIdentifierType(identifierType)[fieldOrder]
              );
              const mangledName = this.getRenamedVariableForNesting(
                alias?.[0] ?? fieldName,
                fieldType
              );
              loweredStatements.push(
                HIR_INDEX_ACCESS({
                  name: mangledName,
                  type: fieldType,
                  pointerExpression: loweredAssignedExpression,
                  index: fieldOrder,
                })
              );
              this.varibleContext.bind(mangledName, HIR_VARIABLE(mangledName, fieldType));
            });
            break;
          }
          case 'VariablePattern':
            this.varibleContext.bind(pattern.name, loweredAssignedExpression);
            break;
          case 'WildCardPattern':
            break;
        }
      });
      if (finalExpression == null) return HIR_ZERO;
      return this.loweredAndAddStatements(finalExpression, loweredStatements);
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

const lowerSamlangExpression = (
  moduleReference: ModuleReference,
  encodedFunctionName: string,
  definedVariables: readonly (readonly [string, HighIRType])[],
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  functionTypeMapping: Readonly<Record<string, HighIRFunctionType>>,
  thisType: HighIRType | null,
  typeLoweringManager: SamlangTypeLoweringManager,
  typeSynthesizer: HighIRTypeSynthesizer,
  stringManager: HighIRStringManager,
  expression: SamlangExpression
): HighIRExpressionLoweringResultWithSyntheticFunctions => {
  const manager = new HighIRExpressionLoweringManager(
    moduleReference,
    encodedFunctionName,
    definedVariables,
    typeDefinitionMapping,
    functionTypeMapping,
    thisType,
    typeLoweringManager,
    typeSynthesizer,
    stringManager
  );
  if (expression.__type__ === 'StatementBlockExpression') manager.depth = -1;
  const result = manager.lower(expression);
  return { ...result, syntheticFunctions: manager.syntheticFunctions };
};

export default lowerSamlangExpression;
