import type { IROperator } from './common-operators';
import { HighIRType, HIR_INT_TYPE, HIR_STRING_TYPE } from './hir-types';

import { Long } from 'samlang-core-utils';

interface BaseHighIRExpression {
  readonly __type__: string;
  readonly type: HighIRType;
}

export interface HighIRIntLiteralExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRIntLiteralExpression';
  readonly value: Long;
}

export interface HighIRStringLiteralExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRStringLiteralExpression';
  readonly value: string;
}

export interface HighIRNameExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRNameExpression';
  readonly name: string;
}

export interface HighIRVariableExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRVariableExpression';
  readonly name: string;
}

export interface HighIRIndexAccessExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRIndexAccessExpression';
  readonly expression: HighIRExpression;
  readonly index: number;
}

export interface HighIRBinaryExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRBinaryExpression';
  readonly e1: HighIRExpression;
  readonly operator: IROperator;
  readonly e2: HighIRExpression;
}

export type HighIRExpression =
  | HighIRIntLiteralExpression
  | HighIRStringLiteralExpression
  | HighIRNameExpression
  | HighIRVariableExpression
  | HighIRIndexAccessExpression
  | HighIRBinaryExpression;

interface BaseHighIRStatement {
  readonly __type__: string;
}

export interface HighIRFunctionCallStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRFunctionCallStatement';
  readonly functionExpression: HighIRExpression;
  readonly functionArguments: readonly HighIRExpression[];
  readonly returnCollector?: string;
}

export interface HighIRIfElseStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIfElseStatement';
  readonly booleanExpression: HighIRExpression;
  readonly s1: readonly HighIRStatement[];
  readonly s2: readonly HighIRStatement[];
}

export interface HighIRWhileTrueStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRWhileTrueStatement';
  readonly statements: readonly HighIRStatement[];
}

export interface HighIRVariantPatternToStatement {
  readonly tagOrder: number;
  readonly statements: readonly HighIRStatement[];
}

export interface HighIRLetDefinitionStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRLetDefinitionStatement';
  readonly name: string;
  readonly type: HighIRType;
  readonly assignedExpression: HighIRExpression;
}

export interface HighIRStructInitializationStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRStructInitializationStatement';
  readonly structVariableName: string;
  readonly type: HighIRType;
  readonly expressionList: readonly HighIRExpression[];
}

export interface HighIRReturnStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRReturnStatement';
  readonly expression: HighIRExpression;
}

export type HighIRStatement =
  | HighIRFunctionCallStatement
  | HighIRIfElseStatement
  | HighIRWhileTrueStatement
  | HighIRLetDefinitionStatement
  | HighIRStructInitializationStatement
  | HighIRReturnStatement;

type ConstructorArgumentObject<E extends BaseHighIRExpression | BaseHighIRStatement> = Omit<
  E,
  '__type__' | 'precedence'
>;

export const HIR_INT = (value: number | Long): HighIRIntLiteralExpression => ({
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_INT_TYPE,
  value: typeof value === 'number' ? Long.fromInt(value) : value,
});

export const HIR_STRING = (value: string): HighIRStringLiteralExpression => ({
  __type__: 'HighIRStringLiteralExpression',
  type: HIR_STRING_TYPE,
  value,
});

export const HIR_ZERO: HighIRIntLiteralExpression = HIR_INT(0);
export const HIR_ONE: HighIRIntLiteralExpression = HIR_INT(1);

export const HIR_NAME = (name: string, type: HighIRType): HighIRNameExpression => ({
  __type__: 'HighIRNameExpression',
  type,
  name,
});

export const HIR_VARIABLE = (name: string, type: HighIRType): HighIRVariableExpression => ({
  __type__: 'HighIRVariableExpression',
  type,
  name,
});

export const HIR_INDEX_ACCESS = ({
  type,
  expression,
  index,
}: ConstructorArgumentObject<HighIRIndexAccessExpression>): HighIRIndexAccessExpression => ({
  __type__: 'HighIRIndexAccessExpression',
  type,
  expression,
  index,
});

export const HIR_BINARY = ({
  operator,
  e1,
  e2,
}: Omit<ConstructorArgumentObject<HighIRBinaryExpression>, 'type'>): HighIRBinaryExpression => ({
  __type__: 'HighIRBinaryExpression',
  type: HIR_INT_TYPE,
  operator,
  e1,
  e2,
});

export const HIR_FUNCTION_CALL = ({
  functionExpression,
  functionArguments,
  returnCollector,
}: ConstructorArgumentObject<HighIRFunctionCallStatement>): HighIRFunctionCallStatement => ({
  __type__: 'HighIRFunctionCallStatement',
  functionExpression,
  functionArguments,
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

export const HIR_WHILE_TRUE = (
  statements: readonly HighIRStatement[]
): HighIRWhileTrueStatement => ({
  __type__: 'HighIRWhileTrueStatement',
  statements,
});

export const HIR_LET = ({
  name,
  type,
  assignedExpression,
}: ConstructorArgumentObject<HighIRLetDefinitionStatement>): HighIRLetDefinitionStatement => ({
  __type__: 'HighIRLetDefinitionStatement',
  name,
  type,
  assignedExpression,
});

export const HIR_STRUCT_INITIALIZATION = ({
  structVariableName,
  type,
  expressionList,
}: ConstructorArgumentObject<HighIRStructInitializationStatement>): HighIRStructInitializationStatement => ({
  __type__: 'HighIRStructInitializationStatement',
  structVariableName,
  type,
  expressionList,
});

export const HIR_RETURN = (expression: HighIRExpression): HighIRReturnStatement => ({
  __type__: 'HighIRReturnStatement',
  expression,
});
