import type { IROperator } from '../common/enums';
import { Literal, FALSE, TRUE, intLiteralOf } from '../common/literals';

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

export interface HighIRStructConstructorExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRStructConstructorExpression';
  readonly expressionList: readonly HighIRExpression[];
}

export interface HighIRIndexAccessExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRIndexAccessExpression';
  readonly expression: HighIRExpression;
  readonly index: number;
}

export interface HighIRFunctionClosureExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRFunctionClosureExpression';
  readonly closureContextExpression: HighIRExpression;
  readonly encodedFunctionName: string;
}

export interface HighIRBinaryExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRBinaryExpression';
  readonly e1: HighIRExpression;
  readonly operator: IROperator;
  readonly e2: HighIRExpression;
}

export type HighIRExpression =
  | HighIRLiteralExpression
  | HighIRVariableExpression
  | HighIRStructConstructorExpression
  | HighIRIndexAccessExpression
  | HighIRFunctionClosureExpression
  | HighIRBinaryExpression;

interface BaseHighIRStatement {
  readonly __type__: string;
}

export interface HighIRFunctionCallStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRFunctionCallStatement';
  readonly functionName: string;
  readonly functionArguments: readonly HighIRExpression[];
  readonly returnCollector: string;
}

export interface HighIRClosureCallStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRClosureCallStatement';
  readonly functionExpression: HighIRExpression;
  readonly closureArguments: readonly HighIRExpression[];
  readonly returnCollector: string;
}

export interface HighIRIfElseStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIfElseStatement';
  readonly booleanExpression: HighIRExpression;
  readonly s1: readonly HighIRStatement[];
  readonly s2: readonly HighIRStatement[];
}

export interface HighIRVariantPatternToStatement {
  readonly tagOrder: number;
  readonly statements: readonly HighIRStatement[];
}

export interface HighIRLetDefinitionStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRLetDefinitionStatement';
  readonly name: string;
  readonly assignedExpression: HighIRExpression;
}

export interface HighIRReturnStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRReturnStatement';
  readonly expression?: HighIRExpression;
}

export type HighIRStatement =
  | HighIRFunctionCallStatement
  | HighIRClosureCallStatement
  | HighIRIfElseStatement
  | HighIRLetDefinitionStatement
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

export const HIR_LITERAL = (literal: Literal): HighIRLiteralExpression => ({
  __type__: 'HighIRLiteralExpression',
  literal,
});

export const HIR_VARIABLE = (name: string): HighIRVariableExpression => ({
  __type__: 'HighIRVariableExpression',
  name,
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

export const HIR_FUNCTION_CLOSURE = ({
  closureContextExpression,
  encodedFunctionName,
}: ConstructorArgumentObject<
  HighIRFunctionClosureExpression
>): HighIRFunctionClosureExpression => ({
  __type__: 'HighIRFunctionClosureExpression',
  closureContextExpression,
  encodedFunctionName,
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

export const HIR_FUNCTION_CALL = ({
  functionName,
  functionArguments,
  returnCollector,
}: ConstructorArgumentObject<HighIRFunctionCallStatement>): HighIRFunctionCallStatement => ({
  __type__: 'HighIRFunctionCallStatement',
  functionName,
  functionArguments,
  returnCollector,
});

export const HIR_CLOSURE_CALL = ({
  functionExpression,
  closureArguments,
  returnCollector,
}: ConstructorArgumentObject<HighIRClosureCallStatement>): HighIRClosureCallStatement => ({
  __type__: 'HighIRClosureCallStatement',
  functionExpression,
  closureArguments,
  returnCollector,
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

export const HIR_LET = ({
  name,
  assignedExpression,
}: ConstructorArgumentObject<HighIRLetDefinitionStatement>): HighIRLetDefinitionStatement => ({
  __type__: 'HighIRLetDefinitionStatement',
  name,
  assignedExpression,
});

export const HIR_RETURN = (expression?: HighIRExpression): HighIRReturnStatement => ({
  __type__: 'HighIRReturnStatement',
  expression,
});
