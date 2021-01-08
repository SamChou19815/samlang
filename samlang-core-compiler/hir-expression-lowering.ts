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
import { checkNotNull, isNotNull } from 'samlang-core-utils';

type HighIRExpressionLoweringResult = {
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

type HighIRExpressionLoweringResultWithSyntheticFunctions = {
  readonly syntheticFunctions: readonly HighIRFunction[];
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

class HighIRExpressionLoweringManager {
  private nextTemporaryVariableId = 0;

  private nextSyntheticFunctionId = 0;

  depth = 0;
  blockID = 0;

  // The variable rewrite is introduced to resolve https://github.com/SamChou19815/samlang/issues/36
  private nestedVariableRewriteMap = new Map<string, string>();

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
        const name = this.nestedVariableRewriteMap.get(expression.name) ?? expression.name;
        return { statements: [], expression: HIR_VARIABLE(name, this.lowerType(expression.type)) };
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
    return {
      statements: result.statements,
      expression: HIR_INDEX_ACCESS({
        type: this.lowerType(expression.type),
        expression: result.expression,
        index: expression.fieldOrder,
      }),
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
    switch (expression.operator) {
      case '!':
        return {
          statements: result.statements,
          expression: createHighIRFlexibleOrderOperatorNode('^', result.expression, HIR_TRUE),
        };
      case '-':
        return {
          statements: result.statements,
          expression: createHighIRFlexibleOrderOperatorNode('-', HIR_ZERO, result.expression),
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
        loweredStatements.push(
          HIR_LET({
            name: closureTemp,
            type: HIR_CLOSURE_TYPE,
            assignedExpression: loweredFunctionExpression,
          })
        );
        loweredStatements.push(
          HIR_LET({
            name: contextTemp,
            type: HIR_ANY_TYPE,
            assignedExpression: HIR_INDEX_ACCESS({
              type: HIR_ANY_TYPE,
              expression: HIR_VARIABLE(closureTemp, HIR_CLOSURE_TYPE),
              index: 1,
            }),
          }),
          HIR_LET({
            name: contextTempForZeroComparison,
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE(closureTemp, HIR_ANY_TYPE),
          })
        );

        functionCall = HIR_IF_ELSE({
          multiAssignedVariable: isVoidReturn
            ? undefined
            : {
                name: returnCollectorName,
                type: loweredReturnType,
                branch1Variable: resultTempB1,
                branch2Variable: resultTempB2,
              },
          booleanExpression: createHighIRFlexibleOrderOperatorNode(
            '==',
            HIR_VARIABLE(contextTempForZeroComparison, HIR_INT_TYPE),
            HIR_ZERO
          ),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE(closureTemp, HIR_CLOSURE_TYPE),
                index: 0,
              }),
              functionArguments: loweredFunctionArguments,
              returnCollector: isVoidReturn
                ? undefined
                : { name: resultTempB1, type: loweredReturnType },
            }),
            isVoidReturn
              ? null
              : HIR_LET({
                  name: returnCollectorName,
                  type: loweredReturnType,
                  assignedExpression: HIR_VARIABLE(resultTempB1, loweredReturnType),
                }),
          ].filter(isNotNull),
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE(closureTemp, HIR_CLOSURE_TYPE),
                index: 0,
              }),
              functionArguments: [
                HIR_VARIABLE(contextTemp, HIR_ANY_TYPE),
                ...loweredFunctionArguments,
              ],
              returnCollector: isVoidReturn
                ? undefined
                : { name: resultTempB2, type: loweredReturnType },
            }),
            isVoidReturn
              ? null
              : HIR_LET({
                  name: returnCollectorName,
                  type: loweredReturnType,
                  assignedExpression: HIR_VARIABLE(resultTempB2, loweredReturnType),
                }),
          ].filter(isNotNull),
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
        const tempB1 = this.allocateTemporaryVariable();
        const tempB2 = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
        return {
          statements: [
            ...e1Result.statements,
            HIR_IF_ELSE({
              multiAssignedVariable: {
                name: temp,
                type: HIR_BOOL_TYPE,
                branch1Variable: tempB1,
                branch2Variable: tempB2,
              },
              booleanExpression: e1Result.expression,
              s1: [
                ...e2Result.statements,
                HIR_LET({
                  name: tempB1,
                  type: HIR_BOOL_TYPE,
                  assignedExpression: e2Result.expression,
                }),
                HIR_LET({
                  name: temp,
                  type: HIR_BOOL_TYPE,
                  assignedExpression: HIR_VARIABLE(tempB1, HIR_BOOL_TYPE),
                }),
              ],
              s2: [
                HIR_LET({ name: tempB2, type: HIR_BOOL_TYPE, assignedExpression: HIR_FALSE }),
                HIR_LET({
                  name: temp,
                  type: HIR_BOOL_TYPE,
                  assignedExpression: HIR_VARIABLE(tempB2, HIR_BOOL_TYPE),
                }),
              ],
            }),
          ],
          expression: HIR_VARIABLE(temp, HIR_BOOL_TYPE),
        };
      }
      case '||': {
        const temp = this.allocateTemporaryVariable();
        const tempB1 = this.allocateTemporaryVariable();
        const tempB2 = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
        return {
          statements: [
            ...e1Result.statements,
            HIR_IF_ELSE({
              multiAssignedVariable: {
                name: temp,
                type: HIR_BOOL_TYPE,
                branch1Variable: tempB1,
                branch2Variable: tempB2,
              },
              booleanExpression: e1Result.expression,
              s1: [
                HIR_LET({ name: tempB1, type: HIR_BOOL_TYPE, assignedExpression: HIR_TRUE }),
                HIR_LET({
                  name: temp,
                  type: HIR_BOOL_TYPE,
                  assignedExpression: HIR_VARIABLE(tempB1, HIR_BOOL_TYPE),
                }),
              ],
              s2: [
                ...e2Result.statements,
                HIR_LET({
                  name: tempB2,
                  type: HIR_BOOL_TYPE,
                  assignedExpression: e2Result.expression,
                }),
                HIR_LET({
                  name: temp,
                  type: HIR_BOOL_TYPE,
                  assignedExpression: HIR_VARIABLE(tempB2, HIR_BOOL_TYPE),
                }),
              ],
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
        return {
          statements: loweredStatements,
          expression: createHighIRFlexibleOrderOperatorNode(operatorSymbol, loweredE1, loweredE2),
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
    const branch1Variable = this.allocateTemporaryVariable();
    const branch2Variable = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_IF_ELSE({
        multiAssignedVariable: isVoidReturn
          ? undefined
          : {
              name: variableForIfElseAssign,
              type: loweredReturnType,
              branch1Variable,
              branch2Variable,
            },
        booleanExpression: loweredBoolExpression,
        s1: isVoidReturn
          ? e1LoweringResult.statements
          : [
              ...e1LoweringResult.statements,
              HIR_LET({
                name: branch1Variable,
                type: loweredReturnType,
                assignedExpression: e1LoweringResult.expression,
              }),
              HIR_LET({
                name: variableForIfElseAssign,
                type: loweredReturnType,
                assignedExpression: HIR_VARIABLE(branch1Variable, loweredReturnType),
              }),
            ],
        s2: isVoidReturn
          ? e2LoweringResult.statements
          : [
              ...e2LoweringResult.statements,
              HIR_LET({
                name: branch2Variable,
                type: loweredReturnType,
                assignedExpression: e2LoweringResult.expression,
              }),
              HIR_LET({
                name: variableForIfElseAssign,
                type: loweredReturnType,
                assignedExpression: HIR_VARIABLE(branch2Variable, loweredReturnType),
              }),
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
    const variableForMatchedExpression = this.allocateTemporaryVariable();
    const variableForTag = this.allocateTemporaryVariable();
    const temporaryVariable = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_LET({
        name: variableForMatchedExpression,
        type: matchedExpression.type,
        assignedExpression: matchedExpression,
      })
    );
    loweredStatements.push(
      HIR_LET({
        name: variableForTag,
        type: HIR_INT_TYPE,
        assignedExpression: HIR_INDEX_ACCESS({
          type: HIR_INT_TYPE,
          expression: HIR_VARIABLE(variableForMatchedExpression, matchedExpression.type),
          index: 0,
        }),
      })
    );
    const loweredMatchingList = expression.matchingList.map(
      ({ tagOrder, dataVariable, expression: patternExpression }) => {
        const localStatements: HighIRStatement[] = [];
        if (dataVariable != null) {
          const [dataVariableName, dataVariableType] = dataVariable;
          localStatements.push(
            HIR_LET({
              name: dataVariableName,
              type: this.lowerType(dataVariableType),
              assignedExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE(variableForMatchedExpression, matchedExpression.type),
                index: 1,
              }),
            })
          );
        }
        const result = this.lower(patternExpression);
        localStatements.push(...result.statements);
        let branchVariable: string | undefined = undefined;
        if (!isVoidReturn) {
          branchVariable = this.allocateTemporaryVariable();
          localStatements.push(
            HIR_LET({
              name: branchVariable,
              type: loweredReturnType,
              assignedExpression: result.expression,
            }),
            HIR_LET({
              name: temporaryVariable,
              type: loweredReturnType,
              assignedExpression: HIR_VARIABLE(branchVariable, loweredReturnType),
            })
          );
        }
        return { tagOrder, branchVariable, statements: localStatements };
      }
    );
    // istanbul ignore next
    if (loweredMatchingList.length < 2) throw new Error();
    let ifElse = HIR_IF_ELSE({
      multiAssignedVariable: isVoidReturn
        ? undefined
        : {
            name: temporaryVariable,
            type: loweredReturnType,
            branch1Variable: checkNotNull(
              loweredMatchingList[loweredMatchingList.length - 2]?.branchVariable
            ),
            branch2Variable: checkNotNull(
              loweredMatchingList[loweredMatchingList.length - 1]?.branchVariable
            ),
          },
      booleanExpression: createHighIRFlexibleOrderOperatorNode(
        '==',
        HIR_VARIABLE(variableForTag, HIR_INT_TYPE),
        HIR_INT(checkNotNull(loweredMatchingList[loweredMatchingList.length - 2]).tagOrder)
      ),
      s1: checkNotNull(loweredMatchingList[loweredMatchingList.length - 2]).statements,
      s2: checkNotNull(loweredMatchingList[loweredMatchingList.length - 1]).statements,
    });
    for (let i = loweredMatchingList.length - 3; i >= 0; i -= 1) {
      const { tagOrder, statements: localStatements } = checkNotNull(loweredMatchingList[i]);
      ifElse = HIR_IF_ELSE({
        multiAssignedVariable: isVoidReturn
          ? undefined
          : {
              name: temporaryVariable,
              type: loweredReturnType,
              branch1Variable: checkNotNull(loweredMatchingList[i]?.branchVariable),
              // Marker for the existence of nested if-else for match
              branch2Variable: temporaryVariable,
            },
        booleanExpression: createHighIRFlexibleOrderOperatorNode(
          '==',
          HIR_VARIABLE(variableForTag, HIR_INT_TYPE),
          HIR_INT(tagOrder)
        ),
        s1: localStatements,
        s2: [ifElse],
      });
    }
    loweredStatements.push(ifElse);
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
        HIR_LET({
          name: variable,
          type: this.lowerType(variableType),
          assignedExpression: HIR_INDEX_ACCESS({
            type: this.lowerType(variableType),
            expression: HIR_VARIABLE('_context', contextType),
            index,
          }),
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
    const blockLocalVariables = new Set<string>();
    this.depth += 1;
    blockStatements.forEach(({ pattern, typeAnnotation, assignedExpression }) => {
      const loweredAssignedExpression = this.loweredAndAddStatements(
        assignedExpression,
        loweredStatements
      );
      switch (pattern.type) {
        case 'TuplePattern': {
          const variableForDestructedExpression = this.allocateTemporaryVariable();
          loweredStatements.push(
            HIR_LET({
              name: variableForDestructedExpression,
              type: this.lowerType(typeAnnotation),
              assignedExpression: loweredAssignedExpression,
            })
          );
          pattern.destructedNames.forEach(([name], index) => {
            if (name == null) {
              return;
            }
            loweredStatements.push(
              HIR_LET({
                name: this.getRenamedVariableForNesting(name, blockLocalVariables),
                // TODO: update type checker and AST to provide better type here.
                type: HIR_ANY_TYPE,
                assignedExpression: HIR_INDEX_ACCESS({
                  // TODO: update type checker and AST to provide better type here.
                  type: HIR_ANY_TYPE,
                  expression: HIR_VARIABLE(
                    variableForDestructedExpression,
                    loweredAssignedExpression.type
                  ),
                  index,
                }),
              })
            );
          });
          break;
        }
        case 'ObjectPattern': {
          const variableForDestructedExpression = this.allocateTemporaryVariable();
          loweredStatements.push(
            HIR_LET({
              name: variableForDestructedExpression,
              type: this.lowerType(typeAnnotation),
              assignedExpression: loweredAssignedExpression,
            })
          );
          pattern.destructedNames.forEach(({ fieldName, fieldOrder, alias }) => {
            loweredStatements.push(
              HIR_LET({
                name: this.getRenamedVariableForNesting(alias ?? fieldName, blockLocalVariables),
                // TODO: update type checker and AST to provide better type here.
                type: HIR_ANY_TYPE,
                assignedExpression: HIR_INDEX_ACCESS({
                  // TODO: update type checker and AST to provide better type here.
                  type: HIR_ANY_TYPE,
                  expression: HIR_VARIABLE(
                    variableForDestructedExpression,
                    loweredAssignedExpression.type
                  ),
                  index: fieldOrder,
                }),
              })
            );
          });
          break;
        }
        case 'VariablePattern':
          loweredStatements.push(
            HIR_LET({
              name: this.getRenamedVariableForNesting(pattern.name, blockLocalVariables),
              type: this.lowerType(typeAnnotation),
              assignedExpression: loweredAssignedExpression,
            })
          );
          break;
        case 'WildCardPattern':
          break;
      }
    });
    if (finalExpression == null) {
      this.blockID += 1;
      this.depth -= 1;
      blockLocalVariables.forEach((variable) => this.nestedVariableRewriteMap.delete(variable));
      return { statements: loweredStatements, expression: HIR_ZERO };
    }
    const loweredFinalExpression = this.loweredAndAddStatements(finalExpression, loweredStatements);
    this.blockID += 1;
    this.depth -= 1;
    blockLocalVariables.forEach((variable) => this.nestedVariableRewriteMap.delete(variable));
    return { statements: loweredStatements, expression: loweredFinalExpression };
  }

  private getRenamedVariableForNesting = (
    name: string,
    blockLocalVariables: Set<string>
  ): string => {
    if (this.depth === 0) {
      return name;
    }
    const renamed = `${name}__depth_${this.depth}__block_${this.blockID}`;
    this.nestedVariableRewriteMap.set(name, renamed);
    blockLocalVariables.add(name);
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
