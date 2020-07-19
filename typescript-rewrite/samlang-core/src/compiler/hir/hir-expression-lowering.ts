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
  readonly expression?: HighIRExpression;
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
  ): HighIRExpression | undefined {
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
    const loweredExpressions = expression.expressions.map(
      (subExpression) => this.loweredAndAddStatements(subExpression, loweredStatements) ?? HIR_FALSE
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
    const loweredFields = expression.fieldDeclarations.map(
      (fieldDeclaration) =>
        this.loweredAndAddStatements(
          fieldDeclaration.expression ?? {
            __type__: 'VariableExpression',
            range: fieldDeclaration.range,
            precedence: 1,
            type: fieldDeclaration.type,
            name: fieldDeclaration.name,
          },
          loweredStatements
        ) ?? HIR_FALSE
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
      expression: HIR_STRUCT_CONSTRUCTOR([
        HIR_INT(BigInt(expression.tagOrder)),
        result.expression ?? HIR_FALSE,
      ]),
    };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const loweredExpression = result.expression;
    // istanbul ignore next
    if (loweredExpression == null) throw new Error();
    return {
      statements: result.statements,
      expression: HIR_INDEX_ACCESS({ expression: loweredExpression, index: expression.fieldOrder }),
    };
  }

  private lowerMethodAccess(expression: MethodAccessExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const loweredExpression = result.expression;
    // istanbul ignore next
    if (loweredExpression == null) throw new Error();
    return {
      statements: result.statements,
      expression: HIR_METHOD_ACCESS({
        expression: loweredExpression,
        className: (expression.expression.type as IdentifierType).identifier,
        methodName: expression.methodName,
      }),
    };
  }

  private lowerUnary(expression: UnaryExpression): HighIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const loweredExpression = result.expression;
    // istanbul ignore next
    if (loweredExpression == null) throw new Error();
    return {
      statements: result.statements,
      expression: HIR_UNARY({ operator: expression.operator, expression: loweredExpression }),
    };
  }

  private lowerPanic(expression: PanicExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerBuiltinFunctionCall(
    expression: BuiltInFunctionCallExpression
  ): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerFunctionCall(expression: FunctionCallExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerBinary(expression: BinaryExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerIfElse(expression: IfElseExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerMatch(expression: MatchExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerLambda(expression: LambdaExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerStatementBlock(
    expression: StatementBlockExpression
  ): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }
}

const lowerSamlangExpression = (expression: SamlangExpression): HighIRExpressionLoweringResult =>
  new HighIRExpressionLoweringManager().lower(expression);

export default lowerSamlangExpression;
