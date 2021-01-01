import {
  encodeFunctionNameGlobally,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
} from 'samlang-core-ast/common-names';
import {
  IdentifierType,
  FunctionType,
  ModuleReference,
  unitType,
  intType,
  stringType,
  tupleType,
  functionType,
} from 'samlang-core-ast/common-nodes';
import {
  HighIRStatement,
  HighIRExpression,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_STRING,
  HIR_INDEX_ACCESS,
  HIR_FUNCTION_CALL,
  HIR_BINARY,
  HIR_IF_ELSE,
  HIR_LET,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
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
import { checkNotNull } from 'samlang-core-utils';

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
    private readonly encodedFunctionName: string
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

  readonly lower = (expression: SamlangExpression): HighIRExpressionLoweringResult => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        switch (expression.literal.type) {
          case 'BoolLiteral':
            return { statements: [], expression: expression.literal.value ? HIR_ONE : HIR_ZERO };
          case 'IntLiteral':
            return { statements: [], expression: HIR_INT(expression.literal.value) };
          case 'StringLiteral':
            return { statements: [], expression: HIR_STRING(expression.literal.value) };
        }
      // eslint-disable-next-line no-fallthrough
      case 'ThisExpression':
        return { statements: [], expression: HIR_VARIABLE('_this', expression.type) };
      case 'VariableExpression': {
        const name = this.nestedVariableRewriteMap.get(expression.name) ?? expression.name;
        return { statements: [], expression: HIR_VARIABLE(name, expression.type) };
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
          expressionList: [
            HIR_NAME(
              encodeFunctionNameGlobally(
                expression.moduleReference,
                expression.className,
                expression.memberName
              ),
              expression.type
            ),
            HIR_ZERO,
          ],
        }),
      ],
      expression: HIR_VARIABLE(structVariableName, tupleType([expression.type, intType])),
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
          expressionList: loweredExpressions,
        }),
      ],
      expression: HIR_VARIABLE(tupleVariableName, expression.type),
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
        expressionList: loweredFields,
      })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(structVariableName, tupleType(loweredFields.map((it) => it.type))),
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
          expressionList: [HIR_INT(BigInt(expression.tagOrder)), result.expression],
        }),
      ],
      expression: HIR_VARIABLE(structVariableName, tupleType([intType, result.expression.type])),
    };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    return {
      statements: result.statements,
      expression: HIR_INDEX_ACCESS({
        type: result.expression.type,
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
          expressionList: [
            HIR_NAME(
              encodeFunctionNameGlobally(
                (expression.expression.type as IdentifierType).moduleReference,
                (expression.expression.type as IdentifierType).identifier,
                expression.methodName
              ),
              expression.type
            ),
            result.expression,
          ],
        }),
      ],
      expression: HIR_VARIABLE(
        structVariableName,
        tupleType([expression.type, result.expression.type])
      ),
    };
  }

  private lowerUnary(expression: UnaryExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    switch (expression.operator) {
      case '!':
        return {
          statements: result.statements,
          expression: HIR_BINARY({
            operator: '^',
            e1: result.expression,
            e2: HIR_INT(BigInt(1)),
          }),
        };
      case '-':
        return {
          statements: result.statements,
          expression: HIR_BINARY({
            operator: '-',
            e1: HIR_INT(BigInt(0)),
            e2: result.expression,
          }),
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
            functionType([stringType], unitType)
          ),
          functionArguments: [result.expression],
          returnCollector: this.allocateTemporaryVariable(),
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
    const returnCollector = this.allocateTemporaryVariable();
    let functionName: string;
    let calledFunctionType: FunctionType;
    switch (expression.functionName) {
      case 'intToString':
        functionName = ENCODED_FUNCTION_NAME_INT_TO_STRING;
        calledFunctionType = functionType([intType], stringType);
        break;
      case 'stringToInt':
        functionName = ENCODED_FUNCTION_NAME_STRING_TO_INT;
        calledFunctionType = functionType([stringType], intType);
        break;
      case 'println':
        functionName = ENCODED_FUNCTION_NAME_PRINTLN;
        calledFunctionType = functionType([stringType], unitType);
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
      expression: HIR_VARIABLE(returnCollector, calledFunctionType.returnType),
    };
  }

  private lowerFunctionCall(expression: FunctionCallExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const functionExpression = expression.functionExpression;
    // This indirection is necessary.
    // We want to force a function call to fall into a statement.
    // In this way, the final expression can be safely ignored,
    // while side effect of function still preserved.
    const returnCollector = this.allocateTemporaryVariable();
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
            functionExpression.type
          ),
          functionArguments: expression.functionArguments.map((oneArgument) =>
            this.loweredAndAddStatements(oneArgument, loweredStatements)
          ),
          returnCollector,
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
            functionExpression.type
          ),
          functionArguments: [
            this.loweredAndAddStatements(functionExpression.expression, loweredStatements),
            ...expression.functionArguments.map((oneArgument) =>
              this.loweredAndAddStatements(oneArgument, loweredStatements)
            ),
          ],
          returnCollector,
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
        loweredStatements.push(
          HIR_LET({ name: closureTemp, assignedExpression: loweredFunctionExpression })
        );
        loweredStatements.push(
          HIR_LET({
            name: contextTemp,
            assignedExpression: HIR_INDEX_ACCESS({
              type: intType,
              expression: HIR_VARIABLE(closureTemp, intType),
              index: 1,
            }),
          })
        );

        functionCall = HIR_IF_ELSE({
          booleanExpression: HIR_BINARY({
            operator: '==',
            e1: HIR_VARIABLE(contextTemp, intType),
            e2: HIR_ZERO,
          }),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: intType,
                expression: HIR_VARIABLE(closureTemp, intType),
                index: 0,
              }),
              functionArguments: loweredFunctionArguments,
              returnCollector,
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: intType,
                expression: HIR_VARIABLE(closureTemp, intType),
                index: 0,
              }),
              functionArguments: [HIR_VARIABLE(contextTemp, intType), ...loweredFunctionArguments],
              returnCollector,
            }),
          ],
        });
        break;
      }
    }
    loweredStatements.push(functionCall);
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(returnCollector, expression.type),
    };
  }

  private shortCircuitBehaviorPreservingBoolExpressionLowering(
    expression: SamlangExpression
  ): HighIRExpressionLoweringResult {
    if (expression.__type__ === 'LiteralExpression' && expression.literal.type === 'BoolLiteral') {
      return {
        statements: [],
        expression: expression.literal.value ? HIR_ONE : HIR_ZERO,
      };
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
              s1: [
                ...e2Result.statements,
                HIR_LET({ name: temp, assignedExpression: e2Result.expression }),
              ],
              s2: [HIR_LET({ name: temp, assignedExpression: HIR_ZERO })],
            }),
          ],
          expression: HIR_VARIABLE(temp, intType),
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
              s1: [HIR_LET({ name: temp, assignedExpression: HIR_ONE })],
              s2: [
                ...e2Result.statements,
                HIR_LET({ name: temp, assignedExpression: e2Result.expression }),
              ],
            }),
          ],
          expression: HIR_VARIABLE(temp, intType),
        };
      }
      case '::': {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const returnCollector = this.allocateTemporaryVariable();
        loweredStatements.push(
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              ENCODED_FUNCTION_NAME_STRING_CONCAT,
              functionType([stringType, stringType], stringType)
            ),
            functionArguments: [loweredE1, loweredE2],
            returnCollector,
          })
        );
        return {
          statements: loweredStatements,
          expression: HIR_VARIABLE(returnCollector, stringType),
        };
      }
      default: {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        return {
          statements: loweredStatements,
          expression: HIR_BINARY({
            operator: operatorSymbol,
            e1: loweredE1,
            e2: loweredE2,
          }),
        };
      }
    }
  }

  private lowerBinary(expression: BinaryExpression): HighIRExpressionLoweringResult {
    return this.shortCircuitBehaviorPreservingBoolExpressionLowering(expression);
  }

  private lowerIfElse(expression: IfElseExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
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
        s1: [
          ...e1LoweringResult.statements,
          HIR_LET({
            name: variableForIfElseAssign,
            assignedExpression: e1LoweringResult.expression,
          }),
        ],
        s2: [
          ...e2LoweringResult.statements,
          HIR_LET({
            name: variableForIfElseAssign,
            assignedExpression: e2LoweringResult.expression,
          }),
        ],
      })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(variableForIfElseAssign, expression.type),
    };
  }

  private lowerMatch(expression: MatchExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const matchedExpression = this.loweredAndAddStatements(
      expression.matchedExpression,
      loweredStatements
    );
    const variableForMatchedExpression = this.allocateTemporaryVariable();
    const variableForTag = this.allocateTemporaryVariable();
    const temporaryVariable = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_LET({ name: variableForMatchedExpression, assignedExpression: matchedExpression })
    );
    loweredStatements.push(
      HIR_LET({
        name: variableForTag,
        assignedExpression: HIR_INDEX_ACCESS({
          type: intType,
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
              assignedExpression: HIR_INDEX_ACCESS({
                type: dataVariableType,
                expression: HIR_VARIABLE(variableForMatchedExpression, matchedExpression.type),
                index: 1,
              }),
            })
          );
        }
        const result = this.lower(patternExpression);
        localStatements.push(...result.statements);
        localStatements.push(
          HIR_LET({ name: temporaryVariable, assignedExpression: result.expression })
        );
        return { tagOrder, statements: localStatements };
      }
    );
    // istanbul ignore next
    if (loweredMatchingList.length < 1) throw new Error();
    let ifElse = HIR_IF_ELSE({
      booleanExpression: HIR_BINARY({
        operator: '==',
        e1: HIR_VARIABLE(variableForTag, intType),
        e2: HIR_INT(
          BigInt(checkNotNull(loweredMatchingList[loweredMatchingList.length - 1]).tagOrder)
        ),
      }),
      s1: checkNotNull(loweredMatchingList[loweredMatchingList.length - 1]).statements,
      s2: [],
    });
    for (let i = loweredMatchingList.length - 2; i >= 0; i -= 1) {
      const { tagOrder, statements: localStatements } = checkNotNull(loweredMatchingList[i]);
      ifElse = HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_VARIABLE(variableForTag, intType),
          e2: HIR_INT(BigInt(tagOrder)),
        }),
        s1: localStatements,
        s2: [ifElse],
      });
    }
    loweredStatements.push(ifElse);
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(temporaryVariable, expression.type),
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
      context = HIR_INT(BigInt(1));
    } else {
      const contextName = this.allocateTemporaryVariable();
      loweredStatements.push(
        HIR_STRUCT_INITIALIZATION({
          structVariableName: contextName,
          expressionList: captured.map(([variableName, variableType]) =>
            HIR_VARIABLE(variableName, variableType)
          ),
        })
      );
      context = HIR_VARIABLE(contextName, intType);
    }
    loweredStatements.push(
      HIR_STRUCT_INITIALIZATION({
        structVariableName,
        expressionList: [HIR_NAME(syntheticLambda.name, expression.type), context],
      })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(structVariableName, tupleType([expression.type, intType])),
    };
  }

  private createSyntheticLambdaFunction(expression: LambdaExpression): HighIRFunction {
    const loweringResult = this.lower(expression.body);
    const lambdaStatements: HighIRStatement[] = [];
    const contextType = tupleType(Object.values(expression.captured));
    Object.entries(expression.captured).forEach(([variable, variableType], index) => {
      lambdaStatements.push(
        HIR_LET({
          name: variable,
          assignedExpression: HIR_INDEX_ACCESS({
            type: variableType,
            expression: HIR_VARIABLE('_context', contextType),
            index,
          }),
        })
      );
    });
    lambdaStatements.push(...loweringResult.statements);
    const returnType = expression.type.returnType;
    const hasReturn = returnType.type !== 'PrimitiveType' || returnType.name !== 'unit';
    if (hasReturn) {
      lambdaStatements.push(HIR_RETURN(loweringResult.expression));
    }
    return {
      name: this.allocateSyntheticFunctionName(),
      parameters: ['_context', ...expression.parameters.map(([name]) => name)],
      hasReturn,
      body: lambdaStatements,
    };
  }

  private lowerStatementBlock({
    block: { statements: blockStatements, expression: finalExpression },
  }: StatementBlockExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const blockLocalVariables = new Set<string>();
    this.depth += 1;
    blockStatements.forEach(({ pattern, assignedExpression }) => {
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
                assignedExpression: HIR_INDEX_ACCESS({
                  type: intType,
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
              assignedExpression: loweredAssignedExpression,
            })
          );
          pattern.destructedNames.forEach(({ fieldName, fieldOrder, alias }) => {
            loweredStatements.push(
              HIR_LET({
                name: this.getRenamedVariableForNesting(alias ?? fieldName, blockLocalVariables),
                assignedExpression: HIR_INDEX_ACCESS({
                  type: intType,
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
              assignedExpression: loweredAssignedExpression,
            })
          );
          break;
        case 'WildCardPattern':
          loweredStatements.push(
            HIR_LET({
              name: this.allocateTemporaryVariable(),
              assignedExpression: loweredAssignedExpression,
            })
          );
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
  expression: SamlangExpression
): HighIRExpressionLoweringResultWithSyntheticFunctions => {
  const manager = new HighIRExpressionLoweringManager(moduleReference, encodedFunctionName);
  if (expression.__type__ === 'StatementBlockExpression') {
    manager.depth = -1;
  }
  const result = manager.lower(expression);
  return { ...result, syntheticFunctions: manager.syntheticFunctions };
};

export default lowerSamlangExpression;
