import { Type } from '../ast/common/types';
import {
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
} from '../ast/lang/samlang-expressions';
import type { ModuleErrorCollector } from '../errors/error-collector';
import { ConstraintAwareChecker } from './constraint-aware-checker';
import fixExpressionType from './expression-type-fixer';
import StatementTypeChecker from './statement-type-checker';
import type TypeResolution from './type-resolution';
import type { LocalTypingContext, AccessibleGlobalTypingContext } from './typing-context';

class ExpressionTypeChecker {
  private readonly constraintAwareTypeChecker: ConstraintAwareChecker;

  private readonly statementTypeChecker: StatementTypeChecker;

  constructor(
    private readonly accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private readonly localTypingContext: LocalTypingContext,
    private readonly resolution: TypeResolution,
    public readonly errorCollector: ModuleErrorCollector
  ) {
    this.constraintAwareTypeChecker = new ConstraintAwareChecker(resolution, errorCollector);
    this.statementTypeChecker = new StatementTypeChecker(
      accessibleGlobalTypingContext,
      errorCollector,
      this.typeCheck
    );
  }

  readonly typeCheck = (expression: SamlangExpression, expectedType: Type): SamlangExpression => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return this.typeCheckLiteral(expression, expectedType);
      case 'ThisExpression':
        return this.typeCheckThis(expression, expectedType);
      case 'VariableExpression':
        return this.typeCheckVariable(expression, expectedType);
      case 'ClassMemberExpression':
        return this.typeCheckClassMember(expression, expectedType);
      case 'TupleConstructorExpression':
        return this.typeCheckTupleConstructor(expression, expectedType);
      case 'ObjectConstructorExpression':
        return this.typeCheckObjectConstructor(expression, expectedType);
      case 'VariantConstructorExpression':
        return this.typeCheckVariantConstructor(expression, expectedType);
      case 'FieldAccessExpression':
        return this.typeCheckFieldAccess(expression, expectedType);
      case 'MethodAccessExpression':
        return this.typeCheckMethodAccess(expression, expectedType);
      case 'UnaryExpression':
        return this.typeCheckUnary(expression, expectedType);
      case 'PanicExpression':
        return this.typeCheckPanic(expression, expectedType);
      case 'BuiltInFunctionCallExpression':
        return this.typeCheckBuiltinFunctionCall(expression, expectedType);
      case 'FunctionCallExpression':
        return this.typeCheckFunctionCall(expression, expectedType);
      case 'BinaryExpression':
        return this.typeCheckBinary(expression, expectedType);
      case 'IfElseExpression':
        return this.typeCheckIfElse(expression, expectedType);
      case 'MatchExpression':
        return this.typeCheckMatch(expression, expectedType);
      case 'LambdaExpression':
        return this.typeCheckLambda(expression, expectedType);
      case 'StatementBlockExpression':
        return this.typeCheckStatementBlock(expression, expectedType);
    }
  };

  private typeCheckLiteral(expression: LiteralExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckThis(expression: ThisExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckVariable(expression: VariableExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckClassMember(
    expression: ClassMemberExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckTupleConstructor(
    expression: TupleConstructorExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckObjectConstructor(
    expression: ObjectConstructorExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckVariantConstructor(
    expression: VariantConstructorExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckFieldAccess(
    expression: FieldAccessExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckMethodAccess(
    expression: MethodAccessExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckUnary(expression: UnaryExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckPanic(expression: PanicExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckBuiltinFunctionCall(
    expression: BuiltInFunctionCallExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckFunctionCall(
    expression: FunctionCallExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckBinary(expression: BinaryExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckIfElse(expression: IfElseExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckMatch(expression: MatchExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckLambda(expression: LambdaExpression, expectedType: Type): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }

  private typeCheckStatementBlock(
    expression: StatementBlockExpression,
    expectedType: Type
  ): SamlangExpression {
    throw new Error(String(this) + String(expression) + String(expectedType));
  }
}

const typeCheckExpression = (
  expression: SamlangExpression,
  errorCollector: ModuleErrorCollector,
  accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
  localTypingContext: LocalTypingContext,
  resolution: TypeResolution,
  expectedType: Type
): SamlangExpression => {
  const checker = new ExpressionTypeChecker(
    accessibleGlobalTypingContext,
    localTypingContext,
    resolution,
    errorCollector
  );
  const checkedExpression = checker.typeCheck(expression, expectedType);
  if (errorCollector.hasErrors) {
    return checkedExpression;
  }
  return fixExpressionType(checkedExpression, expectedType, resolution);
};

export default typeCheckExpression;
