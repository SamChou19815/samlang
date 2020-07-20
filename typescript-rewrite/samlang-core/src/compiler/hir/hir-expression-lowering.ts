import ModuleReference from '../../ast/common/module-reference';
import {
  encodeFunctionNameGlobally,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
} from '../../ast/common/name-encoder';
import type { IdentifierType } from '../../ast/common/types';
import {
  HighIRStatement,
  HighIRExpression,
  HIR_LITERAL,
  HIR_VARIABLE,
  HIR_CLASS_MEMBER,
  HIR_FALSE,
  HIR_TRUE,
  HIR_STRUCT_CONSTRUCTOR,
  HIR_INT,
  HIR_INDEX_ACCESS,
  HIR_METHOD_ACCESS,
  HIR_UNARY,
  HIR_FUNCTION_CALL,
  HIR_CLOSURE_CALL,
  HIR_BINARY,
  HIR_LAMBDA,
  HIR_THROW,
  HIR_MATCH,
  HIR_IF_ELSE,
  HIR_LET,
  HIR_EXPRESSION_AS_STATEMENT,
  HIR_RETURN,
} from '../../ast/hir/hir-expressions';
import type {
  SamlangExpression,
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
} from '../../ast/lang/samlang-expressions';
import type { SamlangModule } from '../../ast/lang/samlang-toplevel';
import { isNotNull } from '../../util/type-assertions';

type HighIRExpressionLoweringResult = {
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

class HighIRExpressionLoweringManager {
  private nextTemporaryVariableId = 0;

  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly samlangModule: SamlangModule
  ) {}

  private allocateTemporaryVariable(): string {
    const variableName = `_LOWERING_${this.nextTemporaryVariableId}`;
    this.nextTemporaryVariableId += 1;
    return variableName;
  }

  private loweredAndAddStatements(
    expression: SamlangExpression,
    statements: HighIRStatement[]
  ): HighIRExpression {
    const result = this.lower(expression);
    statements.push(...result.statements);
    return result.expression;
  }

  private getFunctionName = (className: string, functionName: string): string =>
    encodeFunctionNameGlobally(this.getModuleOfClass(className), className, functionName);

  private getModuleOfClass = (className: string): ModuleReference => {
    const candidate = this.samlangModule.imports
      .map((oneImport) =>
        oneImport.importedMembers.some(([name]) => name === className)
          ? oneImport.importedModule
          : null
      )
      .filter(isNotNull);
    return candidate.length === 0 ? this.moduleReference : candidate[0];
  };

  readonly lower = (expression: SamlangExpression): HighIRExpressionLoweringResult => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return { statements: [], expression: HIR_LITERAL(expression.literal) };
      case 'ThisExpression':
        return { statements: [], expression: HIR_VARIABLE('this') };
      case 'VariableExpression':
        return { statements: [], expression: HIR_VARIABLE(expression.name) };
      case 'ClassMemberExpression':
        return {
          statements: [],
          expression: HIR_CLASS_MEMBER(
            this.getFunctionName(expression.className, expression.memberName)
          ),
        };
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

  private lowerTupleConstructor(
    expression: TupleConstructorExpression
  ): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredExpressions = expression.expressions.map((subExpression) =>
      this.loweredAndAddStatements(subExpression, loweredStatements)
    );
    return {
      statements: loweredStatements,
      expression: HIR_STRUCT_CONSTRUCTOR(loweredExpressions),
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
    return {
      statements: loweredStatements,
      expression: HIR_STRUCT_CONSTRUCTOR(loweredFields),
    };
  }

  private lowerVariantConstructor(
    expression: VariantConstructorExpression
  ): HighIRExpressionLoweringResult {
    const result = this.lower(expression.data);
    return {
      statements: result.statements,
      expression: HIR_STRUCT_CONSTRUCTOR([HIR_INT(BigInt(expression.tagOrder)), result.expression]),
    };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    return {
      statements: result.statements,
      expression: HIR_INDEX_ACCESS({ expression: result.expression, index: expression.fieldOrder }),
    };
  }

  private lowerMethodAccess(expression: MethodAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    return {
      statements: result.statements,
      expression: HIR_METHOD_ACCESS({
        expression: result.expression,
        encodedMethodName: this.getFunctionName(
          (expression.expression.type as IdentifierType).identifier,
          expression.methodName
        ),
      }),
    };
  }

  private lowerUnary(expression: UnaryExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    return {
      statements: result.statements,
      expression: HIR_UNARY({ operator: expression.operator, expression: result.expression }),
    };
  }

  private lowerPanic(expression: PanicExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    return {
      statements: [...result.statements, HIR_THROW(result.expression)],
      expression: HIR_FALSE,
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
    switch (expression.functionName) {
      case 'intToString':
        functionName = ENCODED_FUNCTION_NAME_INT_TO_STRING;
        break;
      case 'stringToInt':
        functionName = ENCODED_FUNCTION_NAME_STRING_TO_INT;
        break;
      case 'println':
        functionName = ENCODED_FUNCTION_NAME_PRINTLN;
        break;
    }
    loweredStatements.push(
      HIR_FUNCTION_CALL({ functionName, functionArguments: [loweredArgument], returnCollector })
    );
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(returnCollector),
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
          functionName: this.getFunctionName(
            functionExpression.className,
            functionExpression.memberName
          ),
          functionArguments: expression.functionArguments.map((oneArgument) =>
            this.loweredAndAddStatements(oneArgument, loweredStatements)
          ),
          returnCollector,
        });
        break;
      case 'MethodAccessExpression':
        functionCall = HIR_FUNCTION_CALL({
          functionName: this.getFunctionName(
            (functionExpression.expression.type as IdentifierType).identifier,
            functionExpression.methodName
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
      default:
        functionCall = HIR_CLOSURE_CALL({
          functionExpression: this.loweredAndAddStatements(functionExpression, loweredStatements),
          closureArguments: expression.functionArguments.map((oneArgument) =>
            this.loweredAndAddStatements(oneArgument, loweredStatements)
          ),
          returnCollector,
        });
        break;
    }
    loweredStatements.push(functionCall);
    return {
      statements: loweredStatements,
      expression: HIR_VARIABLE(returnCollector),
    };
  }

  private shortCircuitBehaviorPreservingBoolExpressionLowering(
    expression: SamlangExpression
  ): HighIRExpressionLoweringResult {
    if (expression.__type__ === 'LiteralExpression' && expression.literal.type === 'BoolLiteral') {
      return {
        statements: [],
        expression: expression.literal.value ? HIR_TRUE : HIR_FALSE,
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
              s2: [HIR_LET({ name: temp, assignedExpression: HIR_FALSE })],
            }),
          ],
          expression: HIR_VARIABLE(temp),
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
              s1: [HIR_LET({ name: temp, assignedExpression: HIR_TRUE })],
              s2: [
                ...e2Result.statements,
                HIR_LET({ name: temp, assignedExpression: e2Result.expression }),
              ],
            }),
          ],
          expression: HIR_VARIABLE(temp),
        };
      }
      case '::': {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const returnCollector = this.allocateTemporaryVariable();
        loweredStatements.push(
          HIR_FUNCTION_CALL({
            functionName: ENCODED_FUNCTION_NAME_STRING_CONCAT,
            functionArguments: [loweredE1, loweredE2],
            returnCollector,
          })
        );
        return { statements: loweredStatements, expression: HIR_VARIABLE(returnCollector) };
      }
      default: {
        const loweredStatements: HighIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        return {
          statements: loweredStatements,
          expression: HIR_BINARY({ operator: operatorSymbol, e1: loweredE1, e2: loweredE2 }),
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
      expression: HIR_VARIABLE(variableForIfElseAssign),
    };
  }

  private lowerMatch(expression: MatchExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const matchedExpression = this.loweredAndAddStatements(
      expression.matchedExpression,
      loweredStatements
    );
    const variableForMatchedExpression = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_LET({ name: variableForMatchedExpression, assignedExpression: matchedExpression })
    );
    const loweredMatchingList = expression.matchingList.map((patternToExpression) => {
      const result = this.lower(patternToExpression.expression);
      return {
        tagOrder: patternToExpression.tagOrder,
        dataVariable: patternToExpression.dataVariable,
        statements: result.statements,
        finalExpression: result.expression,
      };
    });
    const temporaryVariable = this.allocateTemporaryVariable();
    loweredStatements.push(
      HIR_MATCH({
        assignedTemporaryVariable: temporaryVariable,
        variableForMatchedExpression,
        matchingList: loweredMatchingList,
      })
    );
    return { statements: loweredStatements, expression: HIR_VARIABLE(temporaryVariable) };
  }

  private lowerLambda(expression: LambdaExpression): HighIRExpressionLoweringResult {
    const loweringResult = this.lower(expression.body);
    const returnType = expression.type.returnType;
    const hasReturn = returnType.type !== 'PrimitiveType' || returnType.name !== 'unit';
    return {
      statements: [],
      expression: HIR_LAMBDA({
        hasReturn,
        parameters: expression.parameters.map(([name]) => name),
        captured: Object.keys(expression.captured),
        body: hasReturn
          ? [...loweringResult.statements, HIR_RETURN(loweringResult.expression)]
          : loweringResult.statements,
      }),
    };
  }

  private lowerStatementBlock({
    block: { statements: blockStatements, expression: finalExpression },
  }: StatementBlockExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
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
                name,
                assignedExpression: HIR_INDEX_ACCESS({
                  expression: HIR_VARIABLE(variableForDestructedExpression),
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
                name: alias ?? fieldName,
                assignedExpression: HIR_INDEX_ACCESS({
                  expression: HIR_VARIABLE(variableForDestructedExpression),
                  index: fieldOrder,
                }),
              })
            );
          });
          break;
        }
        case 'VariablePattern':
          loweredStatements.push(
            HIR_LET({ name: pattern.name, assignedExpression: loweredAssignedExpression })
          );
          break;
        case 'WildCardPattern':
          loweredStatements.push(HIR_EXPRESSION_AS_STATEMENT(loweredAssignedExpression));
          break;
      }
    });
    if (finalExpression == null) {
      return { statements: loweredStatements, expression: HIR_FALSE };
    }
    const loweredFinalExpression = this.loweredAndAddStatements(finalExpression, loweredStatements);
    return { statements: loweredStatements, expression: loweredFinalExpression };
  }
}

const lowerSamlangExpression = (
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  expression: SamlangExpression
): HighIRExpressionLoweringResult =>
  new HighIRExpressionLoweringManager(moduleReference, samlangModule).lower(expression);

export default lowerSamlangExpression;
