import { BinaryOperator } from '../common/binary-operators';
import { UnaryOperator, BuiltInFunctionName } from '../common/enums';
import { Literal, FALSE, TRUE, intLiteralOf, stringLiteralOf } from '../common/literals';

interface BaseHighIRExpression {
  readonly __type__: string;
}

export interface HighIRLiteralExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRLiteralExpression';
  readonly literal: Literal;
}

export interface HighIRVariableExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRVariableExpression';
  readonly name: string;
}

export interface HighIRClassMemberExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRClassMemberExpression';
  readonly className: string;
  readonly memberName: string;
}

export interface HighIRStructConstructorExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRStructConstructorExpression';
  readonly expressionList: readonly HighIRExpression[];
}

export interface HighIRIndexAccessExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRIndexAccessExpression';
  readonly expression: HighIRExpression;
  readonly index: number;
}

export interface HighIRMethodAccessExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRMethodAccessExpression';
  readonly expression: HighIRExpression;
  readonly className: string;
  readonly methodName: string;
}

export interface HighIRUnaryExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRUnaryExpression';
  readonly operator: UnaryOperator;
  readonly expression: HighIRExpression;
}

export interface HighIRBuiltInFunctionCallExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRBuiltInFunctionCallExpression';
  readonly functionName: BuiltInFunctionName;
  readonly functionArgument: HighIRExpression;
}

export interface HighIRFunctionCallExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRFunctionCallExpression';
  readonly className: string;
  readonly functionName: string;
  readonly functionArguments: readonly HighIRExpression[];
}

export interface HighIRMethodCallExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRMethodCallExpression';
  readonly objectExpression: HighIRExpression;
  readonly className: string;
  readonly methodName: string;
  readonly methodArguments: readonly HighIRExpression[];
}

export interface HighIRClosureCallExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRClosureCallExpression';
  readonly functionExpression: HighIRExpression;
  readonly closureArguments: readonly HighIRExpression[];
}

export interface HighIRBinaryExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRBinaryExpression';
  readonly e1: HighIRExpression;
  readonly operator: BinaryOperator;
  readonly e2: HighIRExpression;
}

export interface HighIRLambdaExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRLambdaExpression';
  readonly hasReturn: boolean;
  readonly parameters: readonly string[];
  readonly captured: readonly string[];
  readonly body: readonly HighIRStatement[];
}

export type HighIRExpression =
  | HighIRLiteralExpression
  | HighIRVariableExpression
  | HighIRClassMemberExpression
  | HighIRStructConstructorExpression
  | HighIRIndexAccessExpression
  | HighIRMethodAccessExpression
  | HighIRUnaryExpression
  | HighIRBuiltInFunctionCallExpression
  | HighIRFunctionCallExpression
  | HighIRMethodCallExpression
  | HighIRClosureCallExpression
  | HighIRBinaryExpression
  | HighIRLambdaExpression;

interface BaseHighIRStatement {
  readonly __type__: string;
}

export interface HighIRThrowStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRThrowStatement';
  readonly expression: HighIRExpression;
}

export interface HighIRIfElseStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIfElseStatement';
  readonly booleanExpression: HighIRExpression;
  readonly s1: readonly HighIRStatement[];
  readonly s2: readonly HighIRStatement[];
}

export interface HighIRVariantPatternToStatement {
  readonly tagOrder: number;
  readonly dataVariable?: string;
  readonly statements: readonly HighIRStatement[];
  readonly finalExpression?: HighIRExpression;
}

export interface HighIRMatchStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRMatchStatement';
  readonly assignedTemporaryVariable?: string;
  readonly variableForMatchedExpression: string;
  readonly matchingList: readonly HighIRVariantPatternToStatement[];
}

export interface HighIRLetDeclarationStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRLetDeclarationStatement';
  readonly name: string;
}

export interface HighIRVariableAssignmentStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRVariableAssignmentStatement';
  readonly name: string;
  readonly assignedExpression: HighIRExpression;
}

export interface HighIRConstantDefinitionStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRConstantDefinitionStatement';
  readonly name: string;
  readonly assignedExpression: HighIRExpression;
}

export interface HighIRExpressionAsStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRExpressionAsStatement';
  readonly expressionWithPotentialSideEffect: HighIRExpression;
}

export interface HighIRReturnStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRReturnStatement';
  readonly expression?: HighIRExpression;
}

export type HighIRStatement =
  | HighIRThrowStatement
  | HighIRIfElseStatement
  | HighIRMatchStatement
  | HighIRLetDeclarationStatement
  | HighIRVariableAssignmentStatement
  | HighIRConstantDefinitionStatement
  | HighIRExpressionAsStatement
  | HighIRReturnStatement;

type ConstructorArgumentObject<E extends BaseHighIRExpression | BaseHighIRStatement> = Omit<
  E,
  '__type__' | 'precedence'
>;

export const HIR_FALSE: HighIRLiteralExpression = {
  __type__: 'HighIRLiteralExpression',
  literal: FALSE,
};

export const HIR_TRUE: HighIRLiteralExpression = {
  __type__: 'HighIRLiteralExpression',
  literal: TRUE,
};

export const HIR_INT = (value: bigint): HighIRLiteralExpression => ({
  __type__: 'HighIRLiteralExpression',
  literal: intLiteralOf(value),
});

export const HIR_STRING = (value: string): HighIRLiteralExpression => ({
  __type__: 'HighIRLiteralExpression',
  literal: stringLiteralOf(value),
});

export const HIR_LITERAL = (literal: Literal): HighIRLiteralExpression => ({
  __type__: 'HighIRLiteralExpression',
  literal,
});

export const HIR_VARIABLE = (name: string): HighIRVariableExpression => ({
  __type__: 'HighIRVariableExpression',
  name,
});

export const HIR_CLASS_MEMBER = ({
  className,
  memberName,
}: ConstructorArgumentObject<HighIRClassMemberExpression>): HighIRClassMemberExpression => ({
  __type__: 'HighIRClassMemberExpression',
  className,
  memberName,
});

export const HIR_STRUCT_CONSTRUCTOR = (
  expressionList: readonly HighIRExpression[]
): HighIRStructConstructorExpression => ({
  __type__: 'HighIRStructConstructorExpression',
  expressionList,
});

export const HIR_INDEX_ACCESS = ({
  expression,
  index,
}: ConstructorArgumentObject<HighIRIndexAccessExpression>): HighIRIndexAccessExpression => ({
  __type__: 'HighIRIndexAccessExpression',
  expression,
  index,
});

export const HIR_METHOD_ACCESS = ({
  expression,
  className,
  methodName,
}: ConstructorArgumentObject<HighIRMethodAccessExpression>): HighIRMethodAccessExpression => ({
  __type__: 'HighIRMethodAccessExpression',
  expression,
  className,
  methodName,
});

export const HIR_UNARY = ({
  expression,
  operator,
}: ConstructorArgumentObject<HighIRUnaryExpression>): HighIRUnaryExpression => ({
  __type__: 'HighIRUnaryExpression',
  expression,
  operator,
});

export const HIR_BUILTIN_FUNCTION_CALL = ({
  functionName,
  functionArgument,
}: ConstructorArgumentObject<
  HighIRBuiltInFunctionCallExpression
>): HighIRBuiltInFunctionCallExpression => ({
  __type__: 'HighIRBuiltInFunctionCallExpression',
  functionName,
  functionArgument,
});

export const HIR_FUNCTION_CALL = ({
  className,
  functionName,
  functionArguments,
}: ConstructorArgumentObject<HighIRFunctionCallExpression>): HighIRFunctionCallExpression => ({
  __type__: 'HighIRFunctionCallExpression',
  className,
  functionName,
  functionArguments,
});

export const HIR_METHOD_CALL = ({
  objectExpression,
  className,
  methodName,
  methodArguments,
}: ConstructorArgumentObject<HighIRMethodCallExpression>): HighIRMethodCallExpression => ({
  __type__: 'HighIRMethodCallExpression',
  objectExpression,
  className,
  methodName,
  methodArguments,
});

export const HIR_CLOSURE_CALL = ({
  functionExpression,
  closureArguments,
}: ConstructorArgumentObject<HighIRClosureCallExpression>): HighIRClosureCallExpression => ({
  __type__: 'HighIRClosureCallExpression',
  functionExpression,
  closureArguments,
});

export const HIR_BINARY = ({
  operator,
  e1,
  e2,
}: ConstructorArgumentObject<HighIRBinaryExpression>): HighIRBinaryExpression => ({
  __type__: 'HighIRBinaryExpression',
  operator,
  e1,
  e2,
});

export const HIR_LAMBDA = ({
  hasReturn,
  parameters,
  captured,
  body,
}: ConstructorArgumentObject<HighIRLambdaExpression>): HighIRLambdaExpression => ({
  __type__: 'HighIRLambdaExpression',
  hasReturn,
  parameters,
  captured,
  body,
});

export const HIR_THROW = (expression: HighIRExpression): HighIRThrowStatement => ({
  __type__: 'HighIRThrowStatement',
  expression,
});

export const HIR_IF_ELSE = ({
  booleanExpression,
  s1,
  s2,
}: ConstructorArgumentObject<HighIRIfElseStatement>): HighIRIfElseStatement => ({
  __type__: 'HighIRIfElseStatement',
  booleanExpression,
  s1,
  s2,
});

export const HIR_MATCH = ({
  assignedTemporaryVariable,
  variableForMatchedExpression,
  matchingList,
}: ConstructorArgumentObject<HighIRMatchStatement>): HighIRMatchStatement => ({
  __type__: 'HighIRMatchStatement',
  assignedTemporaryVariable,
  variableForMatchedExpression,
  matchingList,
});

export const HIR_LET = (name: string): HighIRLetDeclarationStatement => ({
  __type__: 'HighIRLetDeclarationStatement',
  name,
});

export const HIR_ASSIGN = ({
  name,
  assignedExpression,
}: ConstructorArgumentObject<
  HighIRVariableAssignmentStatement
>): HighIRVariableAssignmentStatement => ({
  __type__: 'HighIRVariableAssignmentStatement',
  name,
  assignedExpression,
});

export const HIR_CONST_DEF = ({
  name,
  assignedExpression,
}: ConstructorArgumentObject<
  HighIRConstantDefinitionStatement
>): HighIRConstantDefinitionStatement => ({
  __type__: 'HighIRConstantDefinitionStatement',
  name,
  assignedExpression,
});

export const HIR_EXPRESSION_AS_STATEMENT = (
  expressionWithPotentialSideEffect: HighIRExpression
): HighIRExpressionAsStatement => ({
  __type__: 'HighIRExpressionAsStatement',
  expressionWithPotentialSideEffect,
});

export const HIR_RETURN = (expression?: HighIRExpression): HighIRReturnStatement => ({
  __type__: 'HighIRReturnStatement',
  expression,
});
