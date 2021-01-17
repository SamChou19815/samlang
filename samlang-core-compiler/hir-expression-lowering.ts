import type HighIRStringManager from './hir-string-manager';
import lowerSamlangType from './hir-types-lowering';

import {
  encodeFunctionNameGlobally,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
} from 'samlang-core-ast/common-names';
import type {
  Type,
  IdentifierType,
  ModuleReference,
  FunctionType,
} from 'samlang-core-ast/common-nodes';
import {
  HighIRStatement,
  HighIRExpression,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_FALSE,
  HIR_TRUE,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_INDEX_ACCESS,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
  HIR_BINARY,
  HIR_SWITCH,
} from 'samlang-core-ast/hir-expressions';
import createHighIRFlexibleOrderOperatorNode from 'samlang-core-ast/hir-flexible-op';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import {
  HighIRType,
  HighIRIdentifierType,
  HighIRStructType,
  HighIRFunctionType,
  isTheSameHighIRType,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_STRING_TYPE,
  HIR_CLOSURE_TYPE,
} from 'samlang-core-ast/hir-types';
import type {
  SamlangExpression,
  ClassMemberExpression,
  TupleConstructorExpression,
  ObjectConstructorExpression,
  VariantConstructorExpression,
  FieldAccessExpression,
  MethodAccessExpression,
  UnaryExpression,
  PanicExpression,
  BuiltInFunctionCallExpression,
  FunctionCallExpression,
  BinaryExpression,
  IfElseExpression,
  MatchExpression,
  LambdaExpression,
  StatementBlockExpression,
} from 'samlang-core-ast/samlang-expressions';
import { checkNotNull, LocalStackedContext, zip } from 'samlang-core-utils';

type HighIRExpressionLoweringResult = {
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

type HighIRExpressionLoweringResultWithSyntheticFunctions = {
  readonly syntheticFunctions: readonly HighIRFunction[];
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

class HighIRLoweringVariableContext extends LocalStackedContext<HighIRExpression> {
  addLocalValueType(name: string, value: HighIRExpression, onCollision: () => void): void {
    if (value.__type__ !== 'HighIRVariableExpression') {
      super.addLocalValueType(name, value, onCollision);
      return;
    }
    super.addLocalValueType(name, this.getLocalValueType(value.name) ?? value, onCollision);
  }

  bind(name: string, value: HighIRExpression): void {
    // istanbul ignore next
    this.addLocalValueType(name, value, () => {});
  }
}

class HighIRExpressionLoweringManager {
  private nextTemporaryVariableId = 0;

  private nextSyntheticFunctionId = 0;

  depth = 0;
  blockID = 0;

  private readonly varibleContext = new HighIRLoweringVariableContext();

  readonly syntheticFunctions: HighIRFunction[] = [];

  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly encodedFunctionName: string,
    private readonly typeDefinitionMapping: Readonly<Record<string, readonly HighIRType[]>>,
    private readonly functionTypeMapping: Readonly<Record<string, HighIRFunctionType>>,
    private readonly typeParameters: ReadonlySet<string>,
    private readonly stringManager: HighIRStringManager
  ) {}

  private allocateTemporaryVariable(): string {
    const variableName = `_t${this.nextTemporaryVariableId}`;
    this.nextTemporaryVariableId += 1;
    return variableName;
  }

  private allocateSyntheticFunctionName(): string {
    const functionName = encodeFunctionNameGlobally(
      this.moduleReference,
      this.encodedFunctionName,
      `_SYNTHETIC_${this.nextSyntheticFunctionId}`
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

  private lowerType(type: Type): HighIRType {
    return lowerSamlangType(type, this.typeParameters);
  }

  private lowerWithPotentialCast(
    type: HighIRType,
    assignedExpression: HighIRExpression,
    mutableStatementCollector: HighIRStatement[]
  ): HighIRExpression {
    if (isTheSameHighIRType(type, assignedExpression.type)) {
      return assignedExpression;
    }
    const name = this.allocateTemporaryVariable();
    mutableStatementCollector.push(HIR_CAST({ name, type, assignedExpression }));
    return HIR_VARIABLE(name, type);
  }

  private lowerBindWithPotentialCast(
    name: string,
    type: HighIRType,
    assignedExpression: HighIRExpression,
    mutableStatementCollector: HighIRStatement[]
  ): HighIRExpression {
    if (isTheSameHighIRType(type, assignedExpression.type)) {
      this.varibleContext.bind(name, assignedExpression);
      return assignedExpression;
    }
    mutableStatementCollector.push(HIR_CAST({ name, type, assignedExpression }));
    return HIR_VARIABLE(name, type);
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
      // eslint-disable-next-line no-fallthrough
      case 'ThisExpression':
        return {
          statements: [],
          expression: HIR_VARIABLE('_this', this.lowerType(expression.type)),
        };
      case 'VariableExpression': {
        const stored = this.varibleContext.getLocalValueType(expression.name);
        if (stored != null) return { statements: [], expression: stored };
        return {
          statements: [],
          expression: HIR_VARIABLE(expression.name, this.lowerType(expression.type)),
        };
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
      case 'PanicExpression':
        return this.lowerPanic(expression);
      case 'BuiltInFunctionCallExpression':
        return this.lowerBuiltinFunctionCall(expression);
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
    const structVariableName = this.allocateTemporaryVariable();
    const statements: HighIRStatement[] = [];
    statements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: HIR_CLOSURE_TYPE,
        expressionList: [
          HIR_NAME(
            encodeFunctionNameGlobally(
              expression.moduleReference,
              expression.className,
              expression.memberName
            ),
            this.lowerType(expression.type)
          ),
          this.lowerWithPotentialCast(HIR_ANY_TYPE, HIR_ZERO, statements),
        ],
      })
    );
    return { statements, expression: HIR_VARIABLE(structVariableName, HIR_CLOSURE_TYPE) };
  }

  private lowerTupleConstructor(
    expression: TupleConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const tupleVariableName = this.allocateTemporaryVariable();
    const loweredTupleType = this.lowerType(expression.type) as HighIRStructType;
    const loweredExpressions = zip(
      expression.expressions,
      loweredTupleType.mappings
    ).map(([subExpression, tupleElementType]) =>
      this.lowerWithPotentialCast(
        tupleElementType,
        this.loweredAndAddStatements(subExpression, loweredStatements),
        loweredStatements
      )
    );
    return {
      statements: [
        ...loweredStatements,
        HIR_STRUCT_INITIALIZATION({
          structVariableName: tupleVariableName,
          type: loweredTupleType,
          expressionList: loweredExpressions,
        }),
      ],
      expression: HIR_VARIABLE(tupleVariableName, loweredTupleType),
    };
  }

  private lowerObjectConstructor(
    expression: ObjectConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredIdentifierType = this.lowerType(expression.type) as HighIRIdentifierType;
    const mappingsForIdentifierType = checkNotNull(
      this.typeDefinitionMapping[loweredIdentifierType.name]
    );
    const loweredFields = zip(expression.fieldDeclarations, mappingsForIdentifierType).map(
      ([fieldDeclaration, fieldType]) => {
        const fieldExpression = fieldDeclaration.expression ?? {
          __type__: 'VariableExpression',
          range: fieldDeclaration.range,
          precedence: 1,
          type: fieldDeclaration.type,
          name: fieldDeclaration.name,
        };
        return this.lowerWithPotentialCast(
          fieldType,
          this.loweredAndAddStatements(fieldExpression, loweredStatements),
          loweredStatements
        );
      }
    );
    const structVariableName = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: loweredIdentifierType,
        expressionList: loweredFields,
      })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(structVariableName, loweredIdentifierType),
    };
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
        expressionList: [
          HIR_INT(expression.tagOrder),
          this.lowerWithPotentialCast(HIR_ANY_TYPE, dataExpression, statements),
        ],
      })
    );
    return {
      statements,
      expression: HIR_VARIABLE(structVariableName, variantType),
    };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const mappingsForIdentifierType = checkNotNull(
      this.typeDefinitionMapping[
        (this.lowerType(expression.expression.type) as HighIRIdentifierType).name
      ]
    );
    const expectedFieldType = this.lowerType(expression.type);
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
    return {
      statements,
      expression: this.lowerWithPotentialCast(
        expectedFieldType,
        HIR_VARIABLE(valueName, extractedFieldType),
        statements
      ),
    };
  }

  private lowerMethodAccess(expression: MethodAccessExpression): HighIRExpressionLoweringResult {
    const structVariableName = this.allocateTemporaryVariable();
    const result = this.lower(expression.expression);
    return {
      statements: [
        ...result.statements,
        HIR_STRUCT_INITIALIZATION({
          structVariableName,
          type: HIR_CLOSURE_TYPE,
          expressionList: [
            HIR_NAME(
              encodeFunctionNameGlobally(
                (expression.expression.type as IdentifierType).moduleReference,
                (expression.expression.type as IdentifierType).identifier,
                expression.methodName
              ),
              this.lowerType(expression.type)
            ),
            result.expression,
          ],
        }),
      ],
      expression: HIR_VARIABLE(structVariableName, HIR_CLOSURE_TYPE),
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

  private lowerPanic(expression: PanicExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    return {
      statements: [
        ...result.statements,
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            ENCODED_FUNCTION_NAME_THROW,
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE)
          ),
          functionArguments: [result.expression],
          returnType: HIR_INT_TYPE,
        }),
      ],
      expression: HIR_ZERO,
    };
  }

  private lowerBuiltinFunctionCall(
    expression: BuiltInFunctionCallExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredArgument = this.loweredAndAddStatements(
      expression.argumentExpression,
      loweredStatements
    );
    let functionName: string;
    let calledFunctionType: HighIRFunctionType;
    let returnCollector: string | undefined = undefined;
    let finalExpression: HighIRExpression;
    switch (expression.functionName) {
      case 'intToString':
        functionName = ENCODED_FUNCTION_NAME_INT_TO_STRING;
        calledFunctionType = HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_STRING_TYPE);
        returnCollector = this.allocateTemporaryVariable();
        finalExpression = HIR_VARIABLE(returnCollector, HIR_STRING_TYPE);
        break;
      case 'stringToInt':
        functionName = ENCODED_FUNCTION_NAME_STRING_TO_INT;
        calledFunctionType = HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE);
        returnCollector = this.allocateTemporaryVariable();
        finalExpression = HIR_VARIABLE(returnCollector, HIR_INT_TYPE);
        break;
      case 'println':
        functionName = ENCODED_FUNCTION_NAME_PRINTLN;
        calledFunctionType = HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE);
        finalExpression = HIR_ZERO;
        break;
    }
    loweredStatements.push(
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME(functionName, calledFunctionType),
        functionArguments: [loweredArgument],
        returnType: calledFunctionType.returnType,
        returnCollector,
      })
    );
    return {
      statements: loweredStatements,
      expression: finalExpression,
    };
  }

  private lowerFunctionCall(expression: FunctionCallExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const functionExpression = expression.functionExpression;
    const loweredReturnType = this.lowerType(expression.type);
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
        const functionTypeWithoutContext = checkNotNull(this.functionTypeMapping[functionName]);
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(functionName, functionTypeWithoutContext),
          functionArguments: zip(
            expression.functionArguments,
            functionTypeWithoutContext.argumentTypes
          ).map(([oneArgument, argumentType]) => {
            const loweredArgument = this.loweredAndAddStatements(oneArgument, loweredStatements);
            return this.lowerWithPotentialCast(argumentType, loweredArgument, loweredStatements);
          }),
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
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            functionName,
            HIR_FUNCTION_TYPE(
              [
                this.lowerType(functionExpression.expression.type),
                ...functionTypeWithoutContext.argumentTypes,
              ],
              loweredReturnType
            )
          ),
          functionArguments: [
            this.loweredAndAddStatements(functionExpression.expression, loweredStatements),
            ...zip(expression.functionArguments, functionTypeWithoutContext.argumentTypes).map(
              ([oneArgument, argumentType]) => {
                const loweredArgument = this.loweredAndAddStatements(
                  oneArgument,
                  loweredStatements
                );
                return this.lowerWithPotentialCast(
                  argumentType,
                  loweredArgument,
                  loweredStatements
                );
              }
            ),
          ],
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: returnCollectorName,
        });
        break;
      }
      default: {
        /**
         * Closure ABI:
         * {
         *    __length__: 2
         *    [0]: reference to the function
         *    [1]: context
         * }
         *
         * If context is NULL (0), then it will directly call the function like functionExpr(...restArguments).
         * If context is NONNULL, then it will call functionExpr(context, ...restArguments);
         */
        const sourceLevelFunctionTypeWithoutContext = functionExpression.type as FunctionType;
        const functionTypeWithoutContext = HIR_FUNCTION_TYPE(
          sourceLevelFunctionTypeWithoutContext.argumentTypes.map((it) => this.lowerType(it)),
          this.lowerType(sourceLevelFunctionTypeWithoutContext.returnType)
        );

        const loweredFunctionExpression = this.loweredAndAddStatements(
          functionExpression,
          loweredStatements
        );
        const closureExpression = this.lowerWithPotentialCast(
          HIR_CLOSURE_TYPE,
          loweredFunctionExpression,
          loweredStatements
        );
        const loweredFunctionArguments = zip(
          expression.functionArguments,
          functionTypeWithoutContext.argumentTypes
        ).map(([oneArgument, argumentType]) => {
          const loweredArgument = this.loweredAndAddStatements(oneArgument, loweredStatements);
          return this.lowerWithPotentialCast(argumentType, loweredArgument, loweredStatements);
        });
        const functionTempRaw = this.allocateTemporaryVariable();
        const contextTemp = this.allocateTemporaryVariable();
        const resultTempB1 = this.allocateTemporaryVariable();
        const resultTempB2 = this.allocateTemporaryVariable();
        const comparisonTemp = this.allocateTemporaryVariable();

        loweredStatements.push(
          HIR_INDEX_ACCESS({
            name: functionTempRaw,
            type: HIR_ANY_TYPE,
            pointerExpression: closureExpression,
            index: 0,
          }),
          HIR_INDEX_ACCESS({
            name: contextTemp,
            type: HIR_ANY_TYPE,
            pointerExpression: closureExpression,
            index: 1,
          })
        );
        loweredStatements.push(
          HIR_BINARY({
            name: comparisonTemp,
            operator: '==',
            e1: this.lowerWithPotentialCast(
              HIR_INT_TYPE,
              HIR_VARIABLE(contextTemp, HIR_ANY_TYPE),
              loweredStatements
            ),
            e2: HIR_ZERO,
          })
        );
        const booleanExpression = HIR_VARIABLE(comparisonTemp, HIR_BOOL_TYPE);
        const functionTypeWithContext = HIR_FUNCTION_TYPE(
          [HIR_ANY_TYPE, ...functionTypeWithoutContext.argumentTypes],
          functionTypeWithoutContext.returnType
        );

        const s1: HighIRStatement[] = [];
        const s1FunctionExpression = this.lowerWithPotentialCast(
          functionTypeWithoutContext,
          HIR_VARIABLE(functionTempRaw, HIR_ANY_TYPE),
          s1
        );
        s1.push(
          HIR_FUNCTION_CALL({
            functionExpression: s1FunctionExpression,
            functionArguments: loweredFunctionArguments,
            returnType: functionTypeWithoutContext.returnType,
            returnCollector: isVoidReturn ? undefined : resultTempB1,
          })
        );
        const s2: HighIRStatement[] = [];
        const s2FunctionExpression = this.lowerWithPotentialCast(
          functionTypeWithContext,
          HIR_VARIABLE(functionTempRaw, HIR_ANY_TYPE),
          s2
        );
        s2.push(
          HIR_FUNCTION_CALL({
            functionExpression: s2FunctionExpression,
            functionArguments: [
              HIR_VARIABLE(contextTemp, HIR_ANY_TYPE),
              ...loweredFunctionArguments,
            ],
            returnType: functionTypeWithoutContext.returnType,
            returnCollector: isVoidReturn ? undefined : resultTempB2,
          })
        );
        const finalAssignments = isVoidReturn
          ? []
          : [
              {
                name: returnCollectorName,
                type: functionTypeWithoutContext.returnType,
                branch1Value: HIR_VARIABLE(resultTempB1, functionTypeWithoutContext.returnType),
                branch2Value: HIR_VARIABLE(resultTempB2, functionTypeWithoutContext.returnType),
              },
            ];

        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = HIR_IF_ELSE({ booleanExpression, s1, s2, finalAssignments });
        break;
      }
    }
    loweredReturnType;

    loweredStatements.push(functionCall);
    return {
      statements: loweredStatements,
      expression: isVoidReturn
        ? HIR_ZERO
        : this.lowerWithPotentialCast(
            loweredReturnType,
            HIR_VARIABLE(returnCollectorName, functionReturnCollectorType),
            loweredStatements
          ),
    };
  }

  private shortCircuitBehaviorPreservingBoolExpressionLowering(
    expression: SamlangExpression
  ): HighIRExpressionLoweringResult {
    if (expression.__type__ === 'LiteralExpression' && expression.literal.type === 'BoolLiteral') {
      // istanbul ignore next
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
          return e1Result.expression.value.toInt()
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
          return e1Result.expression.value.toInt()
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
          ...createHighIRFlexibleOrderOperatorNode(
            operatorSymbol,
            loweredE1Original,
            loweredE2Original
          ),
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
    const loweredReturnType = this.lowerType(expression.type);
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const loweredBoolExpression = this.loweredAndAddStatements(
      expression.boolExpression,
      loweredStatements
    );
    const e1LoweringResult = this.lower(expression.e1);
    const e2LoweringResult = this.lower(expression.e2);
    const variableForIfElseAssign = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_IF_ELSE({
        booleanExpression: loweredBoolExpression,
        s1: e1LoweringResult.statements,
        s2: e2LoweringResult.statements,
        finalAssignments: isVoidReturn
          ? []
          : [
              {
                name: variableForIfElseAssign,
                type: loweredReturnType,
                branch1Value: e1LoweringResult.expression,
                branch2Value: e2LoweringResult.expression,
              },
            ],
      })
    );
    return {
      statements: loweredStatements,
      expression: isVoidReturn
        ? HIR_ZERO
        : HIR_VARIABLE(variableForIfElseAssign, loweredReturnType),
    };
  }

  private lowerMatch(expression: MatchExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredReturnType = this.lowerType(expression.type);
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const matchedExpression = this.loweredAndAddStatements(
      expression.matchedExpression,
      loweredStatements
    );
    const variableForTag = this.allocateTemporaryVariable();
    const temporaryVariable = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_INDEX_ACCESS({
        name: variableForTag,
        type: HIR_INT_TYPE,
        pointerExpression: matchedExpression,
        index: 0,
      })
    );
    const loweredMatchingList = expression.matchingList.map(
      ({ tagOrder, dataVariable, expression: patternExpression }) => {
        const localStatements: HighIRStatement[] = [];
        return this.varibleContext.withNestedScope(() => {
          if (dataVariable != null) {
            const dataVariableRawTemp = this.allocateTemporaryVariable();
            const [dataVariableName, dataVariableType] = dataVariable;
            localStatements.push(
              HIR_INDEX_ACCESS({
                name: dataVariableRawTemp,
                type: HIR_ANY_TYPE,
                pointerExpression: matchedExpression,
                index: 1,
              })
            );
            this.lowerBindWithPotentialCast(
              dataVariableName,
              this.lowerType(dataVariableType),
              HIR_VARIABLE(dataVariableRawTemp, HIR_ANY_TYPE),
              localStatements
            );
          }
          const result = this.lower(patternExpression);
          localStatements.push(...result.statements);
          const finalExpression = isVoidReturn ? undefined : result.expression;
          return { tagOrder, finalExpression, statements: localStatements };
        });
      }
    );
    if (isVoidReturn) {
      loweredStatements.push(
        HIR_SWITCH({
          caseVariable: variableForTag,
          cases: loweredMatchingList.map((it) => ({
            caseNumber: it.tagOrder,
            statements: it.statements,
          })),
          finalAssignments: [],
        })
      );
    } else {
      loweredStatements.push(
        HIR_SWITCH({
          caseVariable: variableForTag,
          cases: loweredMatchingList.map(({ tagOrder: caseNumber, statements }) => ({
            caseNumber,
            statements,
          })),
          finalAssignments: [
            {
              name: temporaryVariable,
              type: loweredReturnType,
              branchValues: loweredMatchingList.map((it) => checkNotNull(it.finalExpression)),
            },
          ],
        })
      );
    }
    return {
      statements: loweredStatements,
      expression: isVoidReturn ? HIR_ZERO : HIR_VARIABLE(temporaryVariable, loweredReturnType),
    };
  }

  private lowerLambda(expression: LambdaExpression): HighIRExpressionLoweringResult {
    const syntheticLambda = this.createSyntheticLambdaFunction(expression);
    this.syntheticFunctions.push(syntheticLambda);

    const captured = Object.entries(expression.captured);
    const loweredStatements: HighIRStatement[] = [];
    const structVariableName = this.allocateTemporaryVariable();
    let context: HighIRExpression;
    if (captured.length === 0) {
      // 1: A dummy value that is not zero, used to indicate nonnull context
      context = HIR_ONE;
    } else {
      const contextName = this.allocateTemporaryVariable();
      const expressionList = captured.map(([variableName, variableType]) =>
        HIR_VARIABLE(variableName, this.lowerType(variableType))
      );
      const contextType = HIR_STRUCT_TYPE(expressionList.map((it) => it.type));
      loweredStatements.push(
        HIR_STRUCT_INITIALIZATION({
          structVariableName: contextName,
          type: contextType,
          expressionList,
        })
      );
      context = HIR_VARIABLE(contextName, contextType);
    }
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: HIR_CLOSURE_TYPE,
        expressionList: [
          this.lowerWithPotentialCast(
            HIR_ANY_TYPE,
            HIR_NAME(syntheticLambda.name, syntheticLambda.type),
            loweredStatements
          ),
          this.lowerWithPotentialCast(HIR_ANY_TYPE, context, loweredStatements),
        ],
      })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(structVariableName, HIR_CLOSURE_TYPE),
    };
  }

  private createSyntheticLambdaFunction(expression: LambdaExpression): HighIRFunction {
    const loweringResult = this.lower(expression.body);
    const lambdaStatements: HighIRStatement[] = [];
    const contextType = HIR_STRUCT_TYPE(
      Object.values(expression.captured).map((it) => this.lowerType(it))
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
    lambdaStatements.push(...loweringResult.statements, HIR_RETURN(loweringResult.expression));
    return {
      name: this.allocateSyntheticFunctionName(),
      parameters: ['_context', ...expression.parameters.map(([name]) => name)],
      type: HIR_FUNCTION_TYPE(
        [contextType, ...expression.parameters.map(([, type]) => this.lowerType(type))],
        this.lowerType(expression.type.returnType)
      ),
      body: lambdaStatements,
    };
  }

  private lowerStatementBlock({
    block: { statements: blockStatements, expression: finalExpression },
  }: StatementBlockExpression): HighIRExpressionLoweringResult {
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
            const mappingsForTupleType = (loweredAssignedExpression.type as HighIRStructType)
              .mappings;
            zip(pattern.destructedNames, mappingsForTupleType).forEach(
              ([{ name, type }, extractedFieldType], index) => {
                if (name == null) {
                  return;
                }
                const expectedFieldType = this.lowerType(type);
                const mangledName = this.getRenamedVariableForNesting(name, extractedFieldType);
                loweredStatements.push(
                  HIR_INDEX_ACCESS({
                    name: mangledName,
                    type: extractedFieldType,
                    pointerExpression: loweredAssignedExpression,
                    index,
                  })
                );
                this.lowerWithPotentialCast(
                  expectedFieldType,
                  HIR_VARIABLE(mangledName, extractedFieldType),
                  loweredStatements
                );
              }
            );
            break;
          }
          case 'ObjectPattern': {
            const mappingsForIdentifierType = checkNotNull(
              this.typeDefinitionMapping[
                (loweredAssignedExpression.type as HighIRIdentifierType).name
              ]
            );
            zip(pattern.destructedNames, mappingsForIdentifierType).forEach(
              ([{ fieldName, fieldOrder, type, alias }, extractedFieldType]) => {
                const expectedFieldType = this.lowerType(type);
                const mangledName = this.getRenamedVariableForNesting(
                  alias ?? fieldName,
                  extractedFieldType
                );
                loweredStatements.push(
                  HIR_INDEX_ACCESS({
                    name: mangledName,
                    type: extractedFieldType,
                    pointerExpression: loweredAssignedExpression,
                    index: fieldOrder,
                  })
                );
                this.lowerWithPotentialCast(
                  expectedFieldType,
                  HIR_VARIABLE(mangledName, extractedFieldType),
                  loweredStatements
                );
              }
            );
            break;
          }
          case 'VariablePattern': {
            this.varibleContext.bind(pattern.name, loweredAssignedExpression);
            break;
          }
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
  typeDefinitionMapping: Readonly<Record<string, readonly HighIRType[]>>,
  functionTypeMapping: Readonly<Record<string, HighIRFunctionType>>,
  typeParameters: ReadonlySet<string>,
  stringManager: HighIRStringManager,
  expression: SamlangExpression
): HighIRExpressionLoweringResultWithSyntheticFunctions => {
  const manager = new HighIRExpressionLoweringManager(
    moduleReference,
    encodedFunctionName,
    typeDefinitionMapping,
    functionTypeMapping,
    typeParameters,
    stringManager
  );
  if (expression.__type__ === 'StatementBlockExpression') {
    manager.depth = -1;
  }
  const result = manager.lower(expression);
  return { ...result, syntheticFunctions: manager.syntheticFunctions };
};

export default lowerSamlangExpression;
