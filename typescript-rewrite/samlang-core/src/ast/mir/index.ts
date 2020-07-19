/* eslint-disable camelcase */

import { GlobalVariable } from '../common/structs';

/** Part 1: Operators */

export type MidIRBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '&'
  | '|'
  | '^'
  | '<'
  | '>'
  | '<='
  | '>='
  | '=='
  | '!=';

/** Part 2: Expressions */

interface BaseMidIRExpression {
  readonly __type__: string;
}

export interface MidIRConstantExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRConstantExpression';
  readonly value: bigint;
}

export interface MidIRNameExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRNameExpression';
  readonly name: string;
}

export interface MidIRTemporaryExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRTemporaryExpression';
  readonly temporaryID: string;
}

export interface MidIRImmutableMemoryExpression<E = MidIRExpression> extends BaseMidIRExpression {
  readonly __type__: 'MidIRImmutableMemoryExpression';
  readonly indexExpression: E;
}

export interface MidIRBinaryExpression<E = MidIRExpression> extends BaseMidIRExpression {
  readonly __type__: 'MidIRBinaryExpression';
  readonly operator: MidIRBinaryOperator;
  readonly e1: E;
  readonly e2: E;
}

export interface MidIRExpressionSequenceExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRCallExpression';
  readonly statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[];
  readonly expression: MidIRExpression_DANGEROUSLY_NON_CANONICAL;
}

export type MidIRExpression =
  | MidIRConstantExpression
  | MidIRNameExpression
  | MidIRTemporaryExpression
  | MidIRImmutableMemoryExpression
  | MidIRBinaryExpression;

/** Give it a scary name so we don't construct it after the first lowering of first pass. */
export type MidIRExpression_DANGEROUSLY_NON_CANONICAL =
  | MidIRConstantExpression
  | MidIRNameExpression
  | MidIRTemporaryExpression
  | MidIRImmutableMemoryExpression<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRBinaryExpression<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRExpressionSequenceExpression;

/** Part 3: Statements */

interface BaseMidIRStatement {
  readonly __type__: string;
}

export interface MidIRMoveTempStatement<E = MidIRExpression> extends BaseMidIRStatement {
  readonly __type__: 'MidIRMoveTempStatement';
  readonly temporaryID: string;
  readonly source: E;
}

export interface MidIRMoveMemStatement<E = MidIRExpression> extends BaseMidIRStatement {
  readonly __type__: 'MidIRMoveMemStatement';
  readonly memoryIndexExpression: E;
  readonly source: E;
}

export interface MidIRJumpStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRJumpStatement';
  readonly label: string;
}

export interface MidIRLabelStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRLabelStatement';
  readonly name: string;
}

export interface MidIRCallFunctionStatement<E = MidIRExpression> extends BaseMidIRStatement {
  readonly __type__: 'MidIRCallFunctionStatement';
  readonly functionExpression: E;
  readonly functionArguments: readonly E[];
  readonly returnCollectorTemporaryID?: string;
}

export interface MidIRReturnStatement<E = MidIRExpression> extends BaseMidIRStatement {
  readonly __type__: 'MidIRReturnStatement';
  readonly returnedExpression?: E;
}

export interface MidIRConditionalJumpFallThrough<E = MidIRExpression> extends BaseMidIRStatement {
  readonly __type__: 'MidIRConditionalJumpFallThrough';
  readonly conditionExpression: E;
  readonly label1: string;
}

export interface MidIRConditionalJumpNoFallThrough<E = MidIRExpression> extends BaseMidIRStatement {
  readonly __type__: 'MidIRConditionalJumpNoFallThrough';
  readonly conditionExpression: E;
  readonly label1: string;
  readonly label2: string;
}

export interface MidIRIgnoreExpressionStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRIgnoreExpressionStatement';
  readonly ignoredExpression: MidIRExpression_DANGEROUSLY_NON_CANONICAL;
}

export interface MidIRSequenceStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRSequenceStatement';
  readonly statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[];
}

export type MidIRStatement =
  | MidIRMoveTempStatement
  | MidIRMoveMemStatement
  | MidIRJumpStatement
  | MidIRLabelStatement
  | MidIRCallFunctionStatement
  | MidIRReturnStatement
  | MidIRConditionalJumpFallThrough;

/** Give it a (less) scary name so we don't construct it after the second lowering of second pass. */
export type MidIRStatementLessDangerouslyNonCanonical =
  | MidIRMoveTempStatement
  | MidIRMoveMemStatement
  | MidIRJumpStatement
  | MidIRLabelStatement
  | MidIRCallFunctionStatement
  | MidIRReturnStatement
  | MidIRConditionalJumpNoFallThrough;

/** Give it a scary name so we don't construct it after the first lowering of first pass. */
export type MidIRStatement_DANGEROUSLY_NON_CANONICAL =
  | MidIRMoveTempStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRMoveMemStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRJumpStatement
  | MidIRLabelStatement
  | MidIRCallFunctionStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRReturnStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRConditionalJumpNoFallThrough<MidIRExpression_DANGEROUSLY_NON_CANONICAL>
  | MidIRIgnoreExpressionStatement
  | MidIRSequenceStatement;

/** Part 4: Top Levels */

export interface MidIRFunction {
  readonly functionName: string;
  readonly argumentNames: readonly string[];
  readonly mainBodyStatements: readonly MidIRStatement[];
  readonly numberOfArguments: number;
  readonly hasReturn: boolean;
  readonly isPublic: boolean;
}

export interface MidIRCompilationUnit {
  readonly globalVariables: readonly GlobalVariable[];
  readonly functions: readonly MidIRFunction[];
}

/** Part 5: Constructors */

export const MIR_CONST = (value: bigint): MidIRConstantExpression => ({
  __type__: 'MidIRConstantExpression',
  value,
});

export const MIR_ZERO: MidIRConstantExpression = MIR_CONST(BigInt(0));
export const MIR_ONE: MidIRConstantExpression = MIR_CONST(BigInt(1));
export const MIR_MINUS_ONE: MidIRConstantExpression = MIR_CONST(BigInt(-1));
export const MIR_EIGHT: MidIRConstantExpression = MIR_CONST(BigInt(8));

export const MIR_NAME = (name: string): MidIRNameExpression => ({
  __type__: 'MidIRNameExpression',
  name,
});

export const MIR_TEMP = (temporaryID: string): MidIRTemporaryExpression => ({
  __type__: 'MidIRTemporaryExpression',
  temporaryID,
});

export const MIR_IMMUTABLE_MEM_NON_CANONICAL = (
  indexExpression: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRImmutableMemoryExpression<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRImmutableMemoryExpression',
  indexExpression,
});

export const MIR_IMMUTABLE_MEM = (
  indexExpression: MidIRExpression
): MidIRImmutableMemoryExpression => ({
  __type__: 'MidIRImmutableMemoryExpression',
  indexExpression,
});

export const MIR_OP_NON_CANONICAL = (
  operator: MidIRBinaryOperator,
  e1: MidIRExpression_DANGEROUSLY_NON_CANONICAL,
  e2: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRBinaryExpression<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRBinaryExpression',
  operator,
  e1,
  e2,
});

export const MIR_OP = (
  operator: MidIRBinaryOperator,
  e1: MidIRExpression,
  e2: MidIRExpression
): MidIRBinaryExpression => ({ __type__: 'MidIRBinaryExpression', operator, e1, e2 });

export const MIR_ESEQ_NON_CANONICAL = (
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[],
  expression: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRExpressionSequenceExpression => ({
  __type__: 'MidIRCallExpression',
  statements,
  expression,
});

export const MIR_MOVE_TEMP_NON_CANONICAL = (
  temporary: MidIRTemporaryExpression,
  source: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRMoveTempStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRMoveTempStatement',
  temporaryID: temporary.temporaryID,
  source,
});

export const MIR_MOVE_TEMP = (
  temporary: MidIRTemporaryExpression,
  source: MidIRExpression
): MidIRMoveTempStatement => ({
  __type__: 'MidIRMoveTempStatement',
  temporaryID: temporary.temporaryID,
  source,
});

export const MIR_MOVE_IMMUTABLE_MEM_NON_CANONICAL = (
  memoryIndexExpression: MidIRExpression_DANGEROUSLY_NON_CANONICAL,
  source: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRMoveMemStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRMoveMemStatement',
  memoryIndexExpression,
  source,
});

export const MIR_MOVE_IMMUTABLE_MEM = (
  memoryIndexExpression: MidIRExpression,
  source: MidIRExpression
): MidIRMoveMemStatement<MidIRExpression> => ({
  __type__: 'MidIRMoveMemStatement',
  memoryIndexExpression,
  source,
});

export const MIR_JUMP = (label: string): MidIRJumpStatement => ({
  __type__: 'MidIRJumpStatement',
  label,
});

export const MIR_LABEL = (name: string): MidIRLabelStatement => ({
  __type__: 'MidIRLabelStatement',
  name,
});

export const MIR_CALL_FUNCTION_NON_CANONICAL = (
  functionNameOrExpression: string | MidIRExpression_DANGEROUSLY_NON_CANONICAL,
  functionArguments: readonly MidIRExpression_DANGEROUSLY_NON_CANONICAL[],
  returnCollectorTemporaryID?: string
): MidIRCallFunctionStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRCallFunctionStatement',
  functionExpression:
    typeof functionNameOrExpression === 'string'
      ? MIR_NAME(functionNameOrExpression)
      : functionNameOrExpression,
  functionArguments,
  returnCollectorTemporaryID,
});

export const MIR_CALL_FUNCTION = (
  functionNameOrExpression: string | MidIRExpression,
  functionArguments: readonly MidIRExpression[],
  returnCollectorTemporaryID?: string
): MidIRCallFunctionStatement => ({
  __type__: 'MidIRCallFunctionStatement',
  functionExpression:
    typeof functionNameOrExpression === 'string'
      ? MIR_NAME(functionNameOrExpression)
      : functionNameOrExpression,
  functionArguments,
  returnCollectorTemporaryID,
});

export const MIR_RETURN_NON_CANONICAL = (
  returnedExpression?: MidIRExpression
): MidIRReturnStatement<MidIRExpression> => ({
  __type__: 'MidIRReturnStatement',
  returnedExpression,
});

export const MIR_RETURN = (returnedExpression?: MidIRExpression): MidIRReturnStatement => ({
  __type__: 'MidIRReturnStatement',
  returnedExpression,
});

export const MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL = (
  conditionExpression: MidIRExpression_DANGEROUSLY_NON_CANONICAL,
  label1: string,
  label2: string
): MidIRConditionalJumpNoFallThrough<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRConditionalJumpNoFallThrough',
  conditionExpression,
  label1,
  label2,
});

export const MIR_CJUMP_NON_FALLTHROUGH_LESS_NON_CANONICAL = (
  conditionExpression: MidIRExpression,
  label1: string,
  label2: string
): MidIRConditionalJumpNoFallThrough => ({
  __type__: 'MidIRConditionalJumpNoFallThrough',
  conditionExpression,
  label1,
  label2,
});

export const MIR_CJUMP_FALLTHROUGH = (
  conditionExpression: MidIRExpression,
  label1: string
): MidIRConditionalJumpFallThrough => ({
  __type__: 'MidIRConditionalJumpFallThrough',
  conditionExpression,
  label1,
});

export const MIR_SEQ_IGNORE_EXPRESSION = (
  ignoredExpression: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRIgnoreExpressionStatement => ({
  __type__: 'MidIRIgnoreExpressionStatement',
  ignoredExpression,
});

export const MIR_SEQ_NON_CANONICAL = (
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
): MidIRSequenceStatement => ({ __type__: 'MidIRSequenceStatement', statements });
