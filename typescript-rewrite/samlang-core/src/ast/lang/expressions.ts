import type { BinaryOperator } from '../common/BinaryOperator';
import { Literal, TRUE, FALSE, intLiteralOf, stringLiteralOf } from '../common/Literal';
import type Range from '../common/Range';
import type { BuiltInFunctionName, UnaryOperator } from '../common/enums';
import type { Node } from '../common/structs';
import { Type, boolType, intType, stringType, TupleType, FunctionType } from '../common/types';
import type { Pattern } from './Pattern';

interface BaseExpression extends Node {
  /** Identity of the object used for pattern matching. */
  readonly __type__: string;
  /** Static type of the expression. */
  readonly type: Type;
  /** Precedence level. Lower the number, higher the precedence. */
  readonly precedence: number;
}

type ExpressionConstructorArgumentObject<E extends BaseExpression> = Omit<
  E,
  '__type__' | 'precedence'
>;

type TypelessExpressionConstructorArgumentObject<E extends BaseExpression> = Omit<
  E,
  '__type__' | 'type' | 'precedence'
>;

export interface LiteralExpression extends BaseExpression {
  readonly __type__: 'LiteralExpression';
  readonly literal: Literal;
}

export interface ThisExpression extends BaseExpression {
  readonly __type__: 'ThisExpression';
}

export interface VariableExpression extends BaseExpression {
  readonly __type__: 'VariableExpression';
  readonly name: string;
}

export interface ClassMemberExpression extends BaseExpression {
  readonly __type__: 'ClassMemberExpression';
  readonly typeArguments: readonly Type[];
  readonly className: string;
  readonly classNameRange: Range;
  readonly memberName: string;
  readonly memberNameRange: Range;
}

export interface TupleConstructorExpression extends BaseExpression {
  readonly __type__: 'TupleConstructorExpression';
  readonly type: TupleType;
  readonly expressions: readonly SamlangExpression[];
}

export interface ObjectConstructorExpressionFieldConstructor extends Node {
  readonly type: Type;
  readonly name: string;
  readonly expression?: SamlangExpression;
}

export interface ObjectConstructorExpression extends BaseExpression {
  readonly __type__: 'ObjectConstructorExpression';
  readonly fieldDeclarations?: readonly ObjectConstructorExpressionFieldConstructor[];
}

export interface VariantConstructorExpression extends BaseExpression {
  readonly __type__: 'VariantConstructorExpression';
  readonly tag: string;
  readonly tagOrder: number;
  readonly data: SamlangExpression;
}

export interface FieldAccessExpression extends BaseExpression {
  readonly __type__: 'FieldAccessExpression';
  readonly expression: SamlangExpression;
  readonly fieldName: string;
  readonly fieldOrder: number;
}

export interface MethodAccessExpression extends BaseExpression {
  readonly __type__: 'MethodAccessExpression';
  readonly expression: SamlangExpression;
  readonly methodName: string;
}

export interface UnaryExpression extends BaseExpression {
  readonly __type__: 'UnaryExpression';
  readonly operator: UnaryOperator;
  readonly expression: SamlangExpression;
}

export interface PanicExpression extends BaseExpression {
  readonly __type__: 'PanicExpression';
  readonly expression: SamlangExpression;
}

export interface BuiltInFunctionCallExpression extends BaseExpression {
  readonly __type__: 'BuiltInFunctionCallExpression';
  readonly functionName: BuiltInFunctionName;
  readonly argumentExpression: SamlangExpression;
}

export interface FunctionCallExpression extends BaseExpression {
  readonly __type__: 'FunctionCallExpression';
  readonly functionExpression: SamlangExpression;
  readonly functionArguments: readonly SamlangExpression[];
}

export interface BinaryExpression extends BaseExpression {
  readonly __type__: 'BinaryExpression';
  readonly operator: BinaryOperator;
  readonly e1: SamlangExpression;
  readonly e2: SamlangExpression;
}

export interface IfElseExpression extends BaseExpression {
  readonly __type__: 'IfElseExpression';
  readonly boolExpression: SamlangExpression;
  readonly e1: SamlangExpression;
  readonly e2: SamlangExpression;
}

interface VariantPatternToExpression {
  readonly range: Range;
  readonly tag: string;
  readonly tagOrder: number;
  readonly dataVariable?: string;
  readonly expression: SamlangExpression;
}

export interface MatchExpression extends BaseExpression {
  readonly __type__: 'MatchExpression';
  readonly matchedExpression: SamlangExpression;
  readonly matchingList: readonly VariantPatternToExpression[];
}

export interface LambdaExpression extends BaseExpression {
  readonly __type__: 'LambdaExpression';
  readonly type: FunctionType;
  readonly parameters: readonly (readonly [string, Type])[];
  readonly captured: Record<string, Type | undefined>;
  readonly body: SamlangExpression;
}

export interface SamlangValStatement extends Node {
  readonly pattern: Pattern;
  readonly typeAnnotation: Type;
  readonly assignedExpression: SamlangExpression;
}

export interface StatementBlock extends Node {
  readonly statements: readonly SamlangValStatement[];
  readonly expression?: SamlangExpression;
}

export interface StatementBlockExpression extends BaseExpression {
  readonly __type__: 'StatementBlockExpression';
  readonly block: StatementBlock;
}

export type SamlangExpression =
  | LiteralExpression
  | ThisExpression
  | VariableExpression
  | ClassMemberExpression
  | TupleConstructorExpression
  | VariantConstructorExpression
  | FieldAccessExpression
  | MethodAccessExpression
  | UnaryExpression
  | PanicExpression
  | BuiltInFunctionCallExpression
  | FunctionCallExpression
  | BinaryExpression
  | IfElseExpression
  | MatchExpression
  | LambdaExpression;

export const EXPRESSION_TRUE = (range: Range): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: boolType,
  precedence: 0,
  literal: TRUE,
});

export const EXPRESSION_FALSE = (range: Range): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: boolType,
  precedence: 0,
  literal: FALSE,
});

export const EXPRESSION_INT = (range: Range, value: bigint): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: intType,
  precedence: 0,
  literal: intLiteralOf(value),
});

export const EXPRESSION_STRING = (range: Range, value: string): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: stringType,
  precedence: 0,
  literal: stringLiteralOf(value),
});

export const EXPRESSION_THIS = ({
  range,
  type,
}: ExpressionConstructorArgumentObject<ThisExpression>): ThisExpression => ({
  __type__: 'ThisExpression',
  range,
  type,
  precedence: 0,
});

export const EXPRESSION_VARIABLE = ({
  range,
  type,
  name,
}: ExpressionConstructorArgumentObject<VariableExpression>): VariableExpression => ({
  __type__: 'VariableExpression',
  range,
  type,
  precedence: 0,
  name,
});

export const EXPRESSION_CLASS_MEMBER = ({
  range,
  type,
  typeArguments,
  className,
  classNameRange,
  memberName,
  memberNameRange,
}: ExpressionConstructorArgumentObject<ClassMemberExpression>): ClassMemberExpression => ({
  __type__: 'ClassMemberExpression',
  range,
  type,
  precedence: 0,
  typeArguments,
  className,
  classNameRange,
  memberName,
  memberNameRange,
});

export const EXPRESSION_TUPLE_CONSTRUCTOR = ({
  range,
  type,
  expressions,
}: ExpressionConstructorArgumentObject<
  TupleConstructorExpression
>): TupleConstructorExpression => ({
  __type__: 'TupleConstructorExpression',
  range,
  type,
  precedence: 1,
  expressions,
});

export const EXPRESION_OBJECT_CONSTRUCTOR = ({
  range,
  type,
  fieldDeclarations,
}: ExpressionConstructorArgumentObject<
  ObjectConstructorExpression
>): ObjectConstructorExpression => ({
  __type__: 'ObjectConstructorExpression',
  range,
  type,
  precedence: 1,
  fieldDeclarations,
});

export const EXPRESSION_VARIANT_CONSTRUCTOR = ({
  range,
  type,
  tag,
  tagOrder,
  data,
}: ExpressionConstructorArgumentObject<
  VariantConstructorExpression
>): VariantConstructorExpression => ({
  __type__: 'VariantConstructorExpression',
  range,
  type,
  precedence: 1,
  tag,
  tagOrder,
  data,
});

export const EXPRESSION_FIELD_ACCESS = ({
  range,
  type,
  expression,
  fieldName,
  fieldOrder,
}: ExpressionConstructorArgumentObject<FieldAccessExpression>): FieldAccessExpression => ({
  __type__: 'FieldAccessExpression',
  range,
  type,
  precedence: 2,
  expression,
  fieldName,
  fieldOrder,
});

export const EXPRESSION_METHOD_ACCESS = ({
  range,
  type,
  expression,
  methodName,
}: ExpressionConstructorArgumentObject<MethodAccessExpression>): MethodAccessExpression => ({
  __type__: 'MethodAccessExpression',
  range,
  type,
  precedence: 2,
  expression,
  methodName,
});

export const EXPRESSION_UNARY = ({
  range,
  type,
  operator,
  expression,
}: ExpressionConstructorArgumentObject<UnaryExpression>): UnaryExpression => ({
  __type__: 'UnaryExpression',
  range,
  type,
  precedence: 3,
  operator,
  expression,
});

export const EXPRESSION_PANIC = ({
  range,
  type,
  expression,
}: ExpressionConstructorArgumentObject<PanicExpression>): PanicExpression => ({
  __type__: 'PanicExpression',
  range,
  type,
  precedence: 3,
  expression,
});

export const EXPRESSION_BUILTIN_FUNCTION_CALL = ({
  range,
  type,
  functionName,
  argumentExpression,
}: ExpressionConstructorArgumentObject<
  BuiltInFunctionCallExpression
>): BuiltInFunctionCallExpression => ({
  __type__: 'BuiltInFunctionCallExpression',
  range,
  type,
  precedence: 3,
  functionName,
  argumentExpression,
});

export const EXPRESSION_FUNCTION_CALL = ({
  range,
  type,
  functionExpression,
  functionArguments,
}: ExpressionConstructorArgumentObject<FunctionCallExpression>): FunctionCallExpression => ({
  __type__: 'FunctionCallExpression',
  range,
  type,
  precedence: 4,
  functionExpression,
  functionArguments,
});

export const EXPRESSION_BINARY = ({
  range,
  type,
  operator,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<BinaryExpression>): BinaryExpression => ({
  __type__: 'BinaryExpression',
  range,
  type,
  precedence: 5 + operator.precedence,
  operator,
  e1,
  e2,
});

export const EXPRESSION_IF_ELSE = ({
  range,
  type,
  boolExpression,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<IfElseExpression>): IfElseExpression => ({
  __type__: 'IfElseExpression',
  range,
  type,
  precedence: 11,
  boolExpression,
  e1,
  e2,
});

export const EXPRESSION_MATCH = ({
  range,
  type,
  matchedExpression,
  matchingList,
}: ExpressionConstructorArgumentObject<MatchExpression>): MatchExpression => ({
  __type__: 'MatchExpression',
  range,
  type,
  precedence: 12,
  matchedExpression,
  matchingList,
});

export const EXPRESSION_LAMBDA = ({
  range,
  type,
  parameters,
  captured,
  body,
}: ExpressionConstructorArgumentObject<LambdaExpression>): LambdaExpression => ({
  __type__: 'LambdaExpression',
  range,
  type,
  precedence: 13,
  parameters,
  captured,
  body,
});

export const EXPRESSION_STATEMENT_BLOCK = ({
  range,
  type,
  block,
}: ExpressionConstructorArgumentObject<StatementBlockExpression>): StatementBlockExpression => ({
  __type__: 'StatementBlockExpression',
  range,
  type,
  precedence: 14,
  block,
});
