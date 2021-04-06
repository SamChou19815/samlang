import {
  Literal,
  TRUE,
  FALSE,
  intLiteralOf,
  stringLiteralOf,
  Type,
  boolType,
  intType,
  stringType,
  TupleType,
  FunctionType,
  Range,
  Node,
  ModuleReference,
  TypedComment,
} from './common-nodes';
import type { BinaryOperator } from './common-operators';
import type { Pattern } from './samlang-pattern';

import { Long } from 'samlang-core-utils';

interface BaseExpression extends Node {
  /** Identity of the object used for pattern matching. */
  readonly __type__: string;
  /** Static type of the expression. */
  readonly type: Type;
  /** Precedence level. Lower the number, higher the precedence. */
  readonly precedence: number;
  /** A list of comments immediately before the expression. */
  readonly precedingComments: readonly TypedComment[];
}

type ExpressionConstructorArgumentObject<E extends BaseExpression> = Omit<
  E,
  '__type__' | 'precedence'
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
  readonly moduleReference: ModuleReference;
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
  readonly fieldDeclarations: readonly ObjectConstructorExpressionFieldConstructor[];
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
  readonly operator: '!' | '-';
  readonly expression: SamlangExpression;
}

export interface PanicExpression extends BaseExpression {
  readonly __type__: 'PanicExpression';
  readonly expression: SamlangExpression;
}

export interface BuiltInFunctionCallExpression extends BaseExpression {
  readonly __type__: 'BuiltInFunctionCallExpression';
  readonly functionName: 'stringToInt' | 'intToString' | 'println';
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

export interface VariantPatternToExpression {
  readonly range: Range;
  readonly tag: string;
  readonly tagOrder: number;
  readonly dataVariable?: readonly [string, Type];
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
  readonly captured: Record<string, Type>;
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
  | ObjectConstructorExpression
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
  | LambdaExpression
  | StatementBlockExpression;

export const EXPRESSION_TRUE = (
  range: Range,
  precedingComments: readonly TypedComment[]
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: boolType,
  precedence: 0,
  precedingComments,
  literal: TRUE,
});

export const EXPRESSION_FALSE = (
  range: Range,
  precedingComments: readonly TypedComment[]
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: boolType,
  precedence: 0,
  precedingComments,
  literal: FALSE,
});

export const EXPRESSION_INT = (
  range: Range,
  precedingComments: readonly TypedComment[],
  value: number | Long
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: intType,
  precedence: 0,
  precedingComments,
  literal: intLiteralOf(typeof value === 'number' ? Long.fromInt(value) : value),
});

export const EXPRESSION_STRING = (
  range: Range,
  precedingComments: readonly TypedComment[],
  value: string
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: stringType,
  precedence: 0,
  precedingComments,
  literal: stringLiteralOf(value),
});

export const EXPRESSION_THIS = ({
  range,
  type,
  precedingComments,
}: ExpressionConstructorArgumentObject<ThisExpression>): ThisExpression => ({
  __type__: 'ThisExpression',
  range,
  type,
  precedence: 0,
  precedingComments,
});

export const EXPRESSION_VARIABLE = ({
  range,
  type,
  precedingComments,
  name,
}: ExpressionConstructorArgumentObject<VariableExpression>): VariableExpression => ({
  __type__: 'VariableExpression',
  range,
  type,
  precedence: 0,
  precedingComments,
  name,
});

export const EXPRESSION_CLASS_MEMBER = ({
  range,
  type,
  precedingComments,
  typeArguments,
  moduleReference,
  className,
  classNameRange,
  memberName,
  memberNameRange,
}: ExpressionConstructorArgumentObject<ClassMemberExpression>): ClassMemberExpression => ({
  __type__: 'ClassMemberExpression',
  range,
  type,
  precedence: 0,
  precedingComments,
  typeArguments,
  moduleReference,
  className,
  classNameRange,
  memberName,
  memberNameRange,
});

export const EXPRESSION_TUPLE_CONSTRUCTOR = ({
  range,
  type,
  precedingComments,
  expressions,
}: ExpressionConstructorArgumentObject<TupleConstructorExpression>): TupleConstructorExpression => ({
  __type__: 'TupleConstructorExpression',
  range,
  type,
  precedence: 1,
  precedingComments,
  expressions,
});

export const EXPRESSION_OBJECT_CONSTRUCTOR = ({
  range,
  type,
  precedingComments,
  fieldDeclarations,
}: ExpressionConstructorArgumentObject<ObjectConstructorExpression>): ObjectConstructorExpression => ({
  __type__: 'ObjectConstructorExpression',
  range,
  type,
  precedence: 1,
  precedingComments,
  fieldDeclarations,
});

export const EXPRESSION_VARIANT_CONSTRUCTOR = ({
  range,
  type,
  precedingComments,
  tag,
  tagOrder,
  data,
}: ExpressionConstructorArgumentObject<VariantConstructorExpression>): VariantConstructorExpression => ({
  __type__: 'VariantConstructorExpression',
  range,
  type,
  precedence: 1,
  precedingComments,
  tag,
  tagOrder,
  data,
});

export const EXPRESSION_FIELD_ACCESS = ({
  range,
  type,
  precedingComments,
  expression,
  fieldName,
  fieldOrder,
}: ExpressionConstructorArgumentObject<FieldAccessExpression>): FieldAccessExpression => ({
  __type__: 'FieldAccessExpression',
  range,
  type,
  precedence: 2,
  precedingComments,
  expression,
  fieldName,
  fieldOrder,
});

export const EXPRESSION_METHOD_ACCESS = ({
  range,
  type,
  precedingComments,
  expression,
  methodName,
}: ExpressionConstructorArgumentObject<MethodAccessExpression>): MethodAccessExpression => ({
  __type__: 'MethodAccessExpression',
  range,
  type,
  precedence: 2,
  precedingComments,
  expression,
  methodName,
});

export const EXPRESSION_UNARY = ({
  range,
  type,
  precedingComments,
  operator,
  expression,
}: ExpressionConstructorArgumentObject<UnaryExpression>): UnaryExpression => ({
  __type__: 'UnaryExpression',
  range,
  type,
  precedence: 3,
  precedingComments,
  operator,
  expression,
});

export const EXPRESSION_PANIC = ({
  range,
  type,
  precedingComments,
  expression,
}: ExpressionConstructorArgumentObject<PanicExpression>): PanicExpression => ({
  __type__: 'PanicExpression',
  range,
  type,
  precedence: 3,
  precedingComments,
  expression,
});

export const EXPRESSION_BUILTIN_FUNCTION_CALL = ({
  range,
  type,
  precedingComments,
  functionName,
  argumentExpression,
}: ExpressionConstructorArgumentObject<BuiltInFunctionCallExpression>): BuiltInFunctionCallExpression => ({
  __type__: 'BuiltInFunctionCallExpression',
  range,
  type,
  precedence: 3,
  precedingComments,
  functionName,
  argumentExpression,
});

export const EXPRESSION_FUNCTION_CALL = ({
  range,
  type,
  precedingComments,
  functionExpression,
  functionArguments,
}: ExpressionConstructorArgumentObject<FunctionCallExpression>): FunctionCallExpression => ({
  __type__: 'FunctionCallExpression',
  range,
  type,
  precedence: 4,
  precedingComments,
  functionExpression,
  functionArguments,
});

export const EXPRESSION_BINARY = ({
  range,
  type,
  precedingComments,
  operator,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<BinaryExpression>): BinaryExpression => ({
  __type__: 'BinaryExpression',
  range,
  type,
  precedence: 5 + operator.precedence,
  precedingComments,
  operator,
  e1,
  e2,
});

export const EXPRESSION_IF_ELSE = ({
  range,
  type,
  precedingComments,
  boolExpression,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<IfElseExpression>): IfElseExpression => ({
  __type__: 'IfElseExpression',
  range,
  type,
  precedence: 11,
  precedingComments,
  boolExpression,
  e1,
  e2,
});

export const EXPRESSION_MATCH = ({
  range,
  type,
  precedingComments,
  matchedExpression,
  matchingList,
}: ExpressionConstructorArgumentObject<MatchExpression>): MatchExpression => ({
  __type__: 'MatchExpression',
  range,
  type,
  precedence: 12,
  precedingComments,
  matchedExpression,
  matchingList,
});

export const EXPRESSION_LAMBDA = ({
  range,
  type,
  precedingComments,
  parameters,
  captured,
  body,
}: ExpressionConstructorArgumentObject<LambdaExpression>): LambdaExpression => ({
  __type__: 'LambdaExpression',
  range,
  type,
  precedence: 13,
  precedingComments,
  parameters,
  captured,
  body,
});

export const EXPRESSION_STATEMENT_BLOCK = ({
  range,
  type,
  precedingComments,
  block,
}: ExpressionConstructorArgumentObject<StatementBlockExpression>): StatementBlockExpression => ({
  __type__: 'StatementBlockExpression',
  range,
  type,
  precedence: 2,
  precedingComments,
  block,
});
