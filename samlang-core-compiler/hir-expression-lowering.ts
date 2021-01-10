import createHighIRFlexibleOrderOperatorNode from './hir-flexible-op';
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
import type { Type, IdentifierType, ModuleReference } from 'samlang-core-ast/common-nodes';
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
  HIR_LET,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
  HIR_BINARY,
  HIR_SWITCH,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import {
  HighIRType,
  HighIRFunctionType,
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
import { checkNotNull, LocalStackedContext } from 'samlang-core-utils';

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
    return {
      statements: [
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
            HIR_ZERO,
          ],
        }),
      ],
      expression: HIR_VARIABLE(structVariableName, HIR_CLOSURE_TYPE),
    };
  }

  private lowerTupleConstructor(
    expression: TupleConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const tupleVariableName = this.allocateTemporaryVariable();
    const loweredExpressions = expression.expressions.map((subExpression) =>
      this.loweredAndAddStatements(subExpression, loweredStatements)
    );
    return {
      statements: [
        ...loweredStatements,
        HIR_STRUCT_INITIALIZATION({
          structVariableName: tupleVariableName,
          type: this.lowerType(expression.type),
          expressionList: loweredExpressions,
        }),
      ],
      expression: HIR_VARIABLE(tupleVariableName, this.lowerType(expression.type)),
    };
  }

  private lowerObjectConstructor(
    expression: ObjectConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredFields = expression.fieldDeclarations.map((fieldDeclaration) =>
      this.loweredAndAddStatements(
        fieldDeclaration.expression ?? {
          __type__: 'VariableExpression',
          range: fieldDeclaration.range,
          precedence: 1,
          type: fieldDeclaration.type,
          name: fieldDeclaration.name,
        },
        loweredStatements
      )
    );
    const structVariableName = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: this.lowerType(expression.type),
        expressionList: loweredFields,
      })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(structVariableName, this.lowerType(expression.type)),
    };
  }

  private lowerVariantConstructor(
    expression: VariantConstructorExpression
  ): HighIRExpressionLoweringResult {
    const structVariableName = this.allocateTemporaryVariable();
    const result = this.lower(expression.data);
    return {
      statements: [
        ...result.statements,
        HIR_STRUCT_INITIALIZATION({
          structVariableName,
          type: this.lowerType(expression.type),
          expressionList: [HIR_INT(expression.tagOrder), result.expression],
        }),
      ],
      expression: HIR_VARIABLE(structVariableName, this.lowerType(expression.type)),
    };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const type = this.lowerType(expression.type);
    const valueName = this.allocateTemporaryVariable();
    return {
      statements: [
        ...result.statements,
        HIR_INDEX_ACCESS({
          name: valueName,
          type,
          pointerExpression: result.expression,
          index: expression.fieldOrder,
        }),
      ],
      expression: HIR_VARIABLE(valueName, type),
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
    let returnCollector:
      | { readonly name: string; readonly type: HighIRType }
      | undefined = undefined;
    let finalExpression: HighIRExpression;
    switch (expression.functionName) {
      case 'intToString':
        functionName = ENCODED_FUNCTION_NAME_INT_TO_STRING;
        calledFunctionType = HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_STRING_TYPE);
        returnCollector = { name: this.allocateTemporaryVariable(), type: HIR_STRING_TYPE };
        finalExpression = HIR_VARIABLE(returnCollector.name, HIR_STRING_TYPE);
        break;
      case 'stringToInt':
        functionName = ENCODED_FUNCTION_NAME_STRING_TO_INT;
        calledFunctionType = HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE);
        returnCollector = { name: this.allocateTemporaryVariable(), type: HIR_INT_TYPE };
        finalExpression = HIR_VARIABLE(returnCollector.name, HIR_INT_TYPE);
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
    let functionCall: HighIRStatement;
    switch (functionExpression.__type__) {
      case 'ClassMemberExpression':
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            encodeFunctionNameGlobally(
              functionExpression.moduleReference,
              functionExpression.className,
              functionExpression.memberName
            ),
            this.lowerType(functionExpression.type)
          ),
          functionArguments: expression.functionArguments.map((oneArgument) =>
            this.loweredAndAddStatements(oneArgument, loweredStatements)
          ),
          returnCollector: isVoidReturn
            ? undefined
            : { name: returnCollectorName, type: loweredReturnType },
        });
        break;
      case 'MethodAccessExpression':
        functionCall = HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            encodeFunctionNameGlobally(
              (functionExpression.expression.type as IdentifierType).moduleReference,
              (functionExpression.expression.type as IdentifierType).identifier,
              functionExpression.methodName
            ),
            HIR_FUNCTION_TYPE(
              [
                this.lowerType(functionExpression.expression.type),
                ...expression.functionArguments.map((it) => this.lowerType(it.type)),
              ],
              loweredReturnType
            )
          ),
          functionArguments: [
            this.loweredAndAddStatements(functionExpression.expression, loweredStatements),
            ...expression.functionArguments.map((oneArgument) =>
              this.loweredAndAddStatements(oneArgument, loweredStatements)
            ),
          ],
          returnCollector: isVoidReturn
            ? undefined
            : { name: returnCollectorName, type: loweredReturnType },
        });
        break;
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
        const loweredFunctionExpression = this.loweredAndAddStatements(
          functionExpression,
          loweredStatements
        );
        const loweredFunctionArguments = expression.functionArguments.map((oneArgument) =>
          this.loweredAndAddStatements(oneArgument, loweredStatements)
        );
        const closureTemp = this.allocateTemporaryVariable();
        const contextTemp = this.allocateTemporaryVariable();
        const contextTempForZeroComparison = this.allocateTemporaryVariable();
        const resultTempB1 = this.allocateTemporaryVariable();
        const resultTempB2 = this.allocateTemporaryVariable();
        const functionTempRawB1 = this.allocateTemporaryVariable();
        const functionTempRawB2 = this.allocateTemporaryVariable();
        const functionTempTypedB1 = this.allocateTemporaryVariable();
        const functionTempTypedB2 = this.allocateTemporaryVariable();
        const comparisonTemp = this.allocateTemporaryVariable();
        // NOTE: cast can happen here!
        loweredStatements.push(
          HIR_LET({
            name: closureTemp,
            type: HIR_CLOSURE_TYPE,
            assignedExpression: loweredFunctionExpression,
          })
        );
        loweredStatements.push(
          HIR_INDEX_ACCESS({
            name: contextTemp,
            type: HIR_ANY_TYPE,
            pointerExpression: HIR_VARIABLE(closureTemp, HIR_CLOSURE_TYPE),
            index: 1,
          }),
          // NOTE: cast happens here!
          HIR_LET({
            name: contextTempForZeroComparison,
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE(closureTemp, HIR_ANY_TYPE),
          }),
          HIR_BINARY({
            name: comparisonTemp,
            operator: '==',
            e1: HIR_VARIABLE(contextTempForZeroComparison, HIR_INT_TYPE),
            e2: HIR_ZERO,
          })
        );

        functionCall = HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE(comparisonTemp, HIR_BOOL_TYPE),
          s1: [
            HIR_INDEX_ACCESS({
              name: functionTempRawB1,
              type: HIR_ANY_TYPE,
              pointerExpression: HIR_VARIABLE(closureTemp, HIR_CLOSURE_TYPE),
              index: 0,
            }),
            // NOTE: cast happens here!
            HIR_LET({
              name: functionTempTypedB1,
              type: HIR_FUNCTION_TYPE(
                loweredFunctionArguments.map((it) => it.type),
                loweredReturnType
              ),
              assignedExpression: HIR_VARIABLE(functionTempRawB1, HIR_ANY_TYPE),
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_VARIABLE(
                functionTempTypedB1,
                HIR_FUNCTION_TYPE(
                  loweredFunctionArguments.map((it) => it.type),
                  loweredReturnType
                )
              ),
              functionArguments: loweredFunctionArguments,
              returnCollector: isVoidReturn
                ? undefined
                : { name: resultTempB1, type: loweredReturnType },
            }),
          ],
          s2: [
            HIR_INDEX_ACCESS({
              name: functionTempRawB2,
              type: HIR_ANY_TYPE,
              pointerExpression: HIR_VARIABLE(closureTemp, HIR_CLOSURE_TYPE),
              index: 0,
            }),
            // NOTE: cast happens here!
            HIR_LET({
              name: functionTempTypedB2,
              type: HIR_FUNCTION_TYPE(
                [HIR_ANY_TYPE, ...loweredFunctionArguments.map((it) => it.type)],
                loweredReturnType
              ),
              assignedExpression: HIR_VARIABLE(functionTempRawB2, HIR_ANY_TYPE),
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_VARIABLE(
                functionTempTypedB2,
                HIR_FUNCTION_TYPE(
                  [HIR_ANY_TYPE, ...loweredFunctionArguments.map((it) => it.type)],
                  loweredReturnType
                )
              ),
              functionArguments: [
                HIR_VARIABLE(contextTemp, HIR_ANY_TYPE),
                ...loweredFunctionArguments,
              ],
              returnCollector: isVoidReturn
                ? undefined
                : { name: resultTempB2, type: loweredReturnType },
            }),
          ],
          finalAssignment: isVoidReturn
            ? undefined
            : {
                name: returnCollectorName,
                type: loweredReturnType,
                branch1Value: HIR_VARIABLE(resultTempB1, loweredReturnType),
                branch2Value: HIR_VARIABLE(resultTempB2, loweredReturnType),
              },
        });
        break;
      }
    }
    loweredStatements.push(functionCall);
    return {
      statements: loweredStatements,
      expression: isVoidReturn ? HIR_ZERO : HIR_VARIABLE(returnCollectorName, loweredReturnType),
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
        return {
          statements: [
            ...e1Result.statements,
            HIR_IF_ELSE({
              booleanExpression: e1Result.expression,
              s1: e2Result.statements,
              s2: [],
              finalAssignment: {
                name: temp,
                type: HIR_BOOL_TYPE,
                branch1Value: e2Result.expression,
                branch2Value: HIR_FALSE,
              },
            }),
          ],
          expression: HIR_VARIABLE(temp, HIR_BOOL_TYPE),
        };
      }
      case '||': {
        const temp = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
        return {
          statements: [
            ...e1Result.statements,
            HIR_IF_ELSE({
              booleanExpression: e1Result.expression,
              s1: [],
              s2: e2Result.statements,
              finalAssignment: {
                name: temp,
                type: HIR_BOOL_TYPE,
                branch1Value: HIR_TRUE,
                branch2Value: e2Result.expression,
              },
            }),
          ],
          expression: HIR_VARIABLE(temp, HIR_BOOL_TYPE),
        };
      }
      case '::': {
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
            returnCollector: { name: returnCollectorName, type: HIR_STRING_TYPE },
          })
        );
        return {
          statements: loweredStatements,
          expression: HIR_VARIABLE(returnCollectorName, HIR_STRING_TYPE),
        };
      }
      default: {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const valueTemp = this.allocateTemporaryVariable();
        const binaryStatement = HIR_BINARY({
          name: valueTemp,
          ...createHighIRFlexibleOrderOperatorNode(operatorSymbol, loweredE1, loweredE2),
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
        finalAssignment: isVoidReturn
          ? undefined
          : {
              name: variableForIfElseAssign,
              type: loweredReturnType,
              branch1Value: e1LoweringResult.expression,
              branch2Value: e2LoweringResult.expression,
            },
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
        if (dataVariable != null) {
          const dataVariableRawTemp = this.allocateTemporaryVariable();
          const [dataVariableName, dataVariableType] = dataVariable;
          localStatements.push(
            HIR_INDEX_ACCESS({
              name: dataVariableRawTemp,
              type: HIR_ANY_TYPE,
              pointerExpression: matchedExpression,
              index: 1,
            }),
            // NOTE: cast can happen here
            HIR_LET({
              name: dataVariableName,
              type: this.lowerType(dataVariableType),
              assignedExpression: HIR_VARIABLE(dataVariableRawTemp, HIR_ANY_TYPE),
            })
          );
        }
        const result = this.lower(patternExpression);
        localStatements.push(...result.statements);
        const finalExpression = isVoidReturn ? undefined : result.expression;
        return { tagOrder, finalExpression, statements: localStatements };
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
          finalAssignment: {
            name: temporaryVariable,
            type: loweredReturnType,
            branchValues: loweredMatchingList.map((it) => checkNotNull(it.finalExpression)),
          },
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
        expressionList: [HIR_NAME(syntheticLambda.name, syntheticLambda.type), context],
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
            pattern.destructedNames.forEach(([name], index) => {
              if (name == null) {
                return;
              }
              loweredStatements.push(
                HIR_INDEX_ACCESS({
                  name: this.getRenamedVariableForNesting(name, HIR_ANY_TYPE),
                  // TODO: update type checker and AST to provide better type here.
                  type: HIR_ANY_TYPE,
                  pointerExpression: loweredAssignedExpression,
                  index,
                })
              );
            });
            break;
          }
          case 'ObjectPattern': {
            pattern.destructedNames.forEach(({ fieldName, fieldOrder, alias }) => {
              loweredStatements.push(
                HIR_INDEX_ACCESS({
                  name: this.getRenamedVariableForNesting(alias ?? fieldName, HIR_ANY_TYPE),
                  // TODO: update type checker and AST to provide better type here.
                  type: HIR_ANY_TYPE,
                  pointerExpression: loweredAssignedExpression,
                  index: fieldOrder,
                })
              );
            });
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
  typeParameters: ReadonlySet<string>,
  stringManager: HighIRStringManager,
  expression: SamlangExpression
): HighIRExpressionLoweringResultWithSyntheticFunctions => {
  const manager = new HighIRExpressionLoweringManager(
    moduleReference,
    encodedFunctionName,
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
