import { BinaryOperator } from '../common/binary-operators';
import { UnaryOperator, BuiltInFunctionName } from '../common/enums';
import { Literal } from '../common/literals';

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

export interface HighIRBuiltInFunctionApplicationExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRBuiltInFunctionApplicationExpression';
  readonly functionName: BuiltInFunctionName;
  readonly functionArgument: HighIRExpression;
}

export interface HighIRFunctionApplicationExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRFunctionApplicationExpression';
  readonly className: string;
  readonly functionName: string;
  readonly functionArguments: readonly HighIRExpression[];
}

export interface HighIRMethodApplicationExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRMethodApplicationExpression';
  readonly objectExpression: HighIRExpression;
  readonly className: string;
  readonly methodName: string;
  readonly methodArguments: readonly HighIRExpression[];
}

export interface HighIRClosureApplicationExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRClosureApplicationExpression';
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
  | HighIRBuiltInFunctionApplicationExpression
  | HighIRFunctionApplicationExpression
  | HighIRMethodApplicationExpression
  | HighIRClosureApplicationExpression
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
