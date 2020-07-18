import { BinaryOperator } from '../common/binary-operators';
import { UnaryOperator, BuiltInFunctionName } from '../common/enums';
import { Literal } from '../common/literals';

export interface BaseHighIRExpression {
  readonly __type__: string;
}

export interface HighIRUnitExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRUnitExpression';
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

export interface HighIRTupleConstructorExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRTupleConstructorExpression';
  readonly expressionList: readonly HighIRExpression[];
}

export interface HighIRObjectConstructorExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRObjectConstructorExpression';
  readonly fieldDeclaration: readonly (readonly [string, HighIRExpression])[];
}

export interface HighIRVariantConstructorExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRVariantConstructorExpression';
  readonly tag: string;
  readonly tagOrder: number;
  readonly data: HighIRExpression;
}

export interface HighIRFieldAccessExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRFieldAccessExpression';
  readonly expression: HighIRExpression;
  readonly fieldName: string;
  readonly fieldOrder: number;
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
  readonly argument: HighIRExpression;
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

export interface HighIRTernaryExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRTernaryExpression';
  readonly boolExpression: HighIRExpression;
  readonly e1: HighIRExpression;
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
  | HighIRUnitExpression
  | HighIRLiteralExpression
  | HighIRVariableExpression
  | HighIRClassMemberExpression
  | HighIRTupleConstructorExpression
  | HighIRObjectConstructorExpression
  | HighIRVariantConstructorExpression
  | HighIRFieldAccessExpression
  | HighIRMethodAccessExpression
  | HighIRUnaryExpression
  | HighIRBuiltInFunctionApplicationExpression
  | HighIRFunctionApplicationExpression
  | HighIRMethodApplicationExpression
  | HighIRClosureApplicationExpression
  | HighIRBinaryExpression
  | HighIRTernaryExpression
  | HighIRLambdaExpression;

export type HighIRStatement = void;
