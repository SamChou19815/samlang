import { HighIRStatement, HighIRExpression } from '../../ast/hir/hir-expressions';
import type {
  SamlangExpression,
  LiteralExpression,
  ThisExpression,
  VariableExpression,
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

  readonly lower = (expression: SamlangExpression): HighIRExpressionLoweringResult => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return this.lowerLiteral(expression);
      case 'ThisExpression':
        return this.lowerThis(expression);
      case 'VariableExpression':
        return this.lowerVariable(expression);
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

  private lowerLiteral(expression: LiteralExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerThis(expression: ThisExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerVariable(expression: VariableExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerClassMember(expression: ClassMemberExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerTupleConstructor(
    expression: TupleConstructorExpression
  ): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerObjectConstructor(
    expression: ObjectConstructorExpression
  ): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerVariantConstructor(
    expression: VariantConstructorExpression
  ): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerFieldAccess(expression: FieldAccessExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerMethodAccess(expression: MethodAccessExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
  }

  private lowerUnary(expression: UnaryExpression): HighIRExpressionLoweringResult {
    throw new Error(`${this} ${expression}`);
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
