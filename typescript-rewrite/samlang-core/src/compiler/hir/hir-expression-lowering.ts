import type { IdentifierType } from '../../ast/common/types';
import {
  HighIRStatement,
  HighIRExpression,
  HIR_LITERAL,
  HIR_VARIABLE,
  HIR_CLASS_MEMBER,
  HIR_FALSE,
  HIR_STRUCT_CONSTRUCTOR,
  HIR_INT,
  HIR_INDEX_ACCESS,
  HIR_METHOD_ACCESS,
  HIR_UNARY,
  HIR_BUILTIN_FUNCTION_CALL,
  HIR_FUNCTION_CALL,
  HIR_METHOD_CALL,
  HIR_CLOSURE_CALL,
  HIR_BINARY,
  HIR_LAMBDA,
  HIR_THROW,
  HIR_MATCH,
  HIR_IF_ELSE,
  HIR_ASSIGN,
  HIR_LET,
  HIR_CONST_DEF,
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

type HighIRExpressionLoweringResult = {
  readonly statements: readonly HighIRStatement[];
  readonly expression: HighIRExpression;
};

class HighIRExpressionLoweringManager {
  private nextTemporaryVariableId = 0;

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
          expression: HIR_CLASS_MEMBER({
            className: expression.className,
            memberName: expression.memberName,
          }),
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
        className: (expression.expression.type as IdentifierType).identifier,
        methodName: expression.methodName,
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
    return {
      statements: loweredStatements,
      expression: HIR_BUILTIN_FUNCTION_CALL({
        functionName: expression.functionName,
        functionArgument: loweredArgument,
      }),
    };
  }

  private lowerFunctionCall(expression: FunctionCallExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const loweredFunctionExpression = this.loweredAndAddStatements(
      expression.functionExpression,
      loweredStatements
    );
    const loweredArguments = expression.functionArguments.map((oneArgument) =>
      this.loweredAndAddStatements(oneArgument, loweredStatements)
    );
    let functionCall: HighIRExpression;
    switch (loweredFunctionExpression.__type__) {
      case 'HighIRClassMemberExpression':
        functionCall = HIR_FUNCTION_CALL({
          className: loweredFunctionExpression.className,
          functionName: loweredFunctionExpression.memberName,
          functionArguments: loweredArguments,
        });
        break;
      case 'HighIRMethodAccessExpression':
        functionCall = HIR_METHOD_CALL({
          objectExpression: loweredFunctionExpression.expression,
          className: loweredFunctionExpression.className,
          methodName: loweredFunctionExpression.methodName,
          methodArguments: loweredArguments,
        });
        break;
      default:
        functionCall = HIR_CLOSURE_CALL({
          functionExpression: loweredFunctionExpression,
          closureArguments: loweredArguments,
        });
        break;
    }
    return {
      statements: loweredStatements,
      expression: functionCall,
    };
  }

  private lowerBinary(expression: BinaryExpression): HighIRExpressionLoweringResult {
    const loweredStatements: HighIRStatement[] = [];
    const e1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
    const e2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
    return {
      statements: loweredStatements,
      expression: HIR_BINARY({ operator: expression.operator, e1, e2 }),
    };
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
      HIR_LET(variableForIfElseAssign),
      HIR_IF_ELSE({
        booleanExpression: loweredBoolExpression,
        s1: [
          ...e1LoweringResult.statements,
          HIR_ASSIGN({
            name: variableForIfElseAssign,
            assignedExpression: e1LoweringResult.expression,
          }),
        ],
        s2: [
          ...e2LoweringResult.statements,
          HIR_ASSIGN({
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
      HIR_CONST_DEF({ name: variableForMatchedExpression, assignedExpression: matchedExpression })
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
            HIR_CONST_DEF({
              name: variableForDestructedExpression,
              assignedExpression: loweredAssignedExpression,
            })
          );
          pattern.destructedNames.forEach(([name], index) => {
            if (name == null) {
              return;
            }
            loweredStatements.push(
              HIR_CONST_DEF({
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
            HIR_CONST_DEF({
              name: variableForDestructedExpression,
              assignedExpression: loweredAssignedExpression,
            })
          );
          pattern.destructedNames.forEach(({ fieldName, fieldOrder, alias }) => {
            loweredStatements.push(
              HIR_CONST_DEF({
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
            HIR_CONST_DEF({ name: pattern.name, assignedExpression: loweredAssignedExpression })
          );
          break;
        case 'WildCardPattern':
          loweredStatements.push(HIR_EXPRESSION_AS_STATEMENT(loweredAssignedExpression));
          break;
      }
    });
    if (finalExpression == null) {
      return { statements: [], expression: HIR_FALSE };
    }
    const loweredFinalExpression = this.loweredAndAddStatements(finalExpression, loweredStatements);
    return { statements: loweredStatements, expression: loweredFinalExpression };
  }
}

const lowerSamlangExpression = (expression: SamlangExpression): HighIRExpressionLoweringResult =>
  new HighIRExpressionLoweringManager().lower(expression);

export default lowerSamlangExpression;
