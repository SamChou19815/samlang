/* eslint-disable camelcase */

/** Part 1: Type Imports */

import type { IROperator } from '../common/enums';
import type { GlobalVariable } from '../common/structs';

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
  readonly operator: IROperator;
  readonly e1: E;
  readonly e2: E;
}

export interface MidIRExpressionSequenceExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRExpressionSequenceExpression';
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
  | MidIRConditionalJumpNoFallThrough<MidIRExpression_DANGEROUSLY_NON_CANONICAL>;

/** Part 4: Top Levels */

export interface MidIRFunction {
  readonly functionName: string;
  readonly argumentNames: readonly string[];
  readonly mainBodyStatements: readonly MidIRStatement[];
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
  operator: IROperator,
  e1: MidIRExpression_DANGEROUSLY_NON_CANONICAL,
  e2: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRBinaryExpression<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRBinaryExpression',
  operator,
  e1,
  e2,
});

export const MIR_OP = (
  operator: IROperator,
  e1: MidIRExpression,
  e2: MidIRExpression
): MidIRBinaryExpression => ({ __type__: 'MidIRBinaryExpression', operator, e1, e2 });

export const MIR_ESEQ_NON_CANONICAL = (
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[],
  expression: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRExpressionSequenceExpression => ({
  __type__: 'MidIRExpressionSequenceExpression',
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
  memory: MidIRImmutableMemoryExpression<MidIRExpression_DANGEROUSLY_NON_CANONICAL>,
  source: MidIRExpression_DANGEROUSLY_NON_CANONICAL
): MidIRMoveMemStatement<MidIRExpression_DANGEROUSLY_NON_CANONICAL> => ({
  __type__: 'MidIRMoveMemStatement',
  memoryIndexExpression: memory.indexExpression,
  source,
});

export const MIR_MOVE_IMMUTABLE_MEM = (
  memory: MidIRImmutableMemoryExpression,
  source: MidIRExpression
): MidIRMoveMemStatement<MidIRExpression> => ({
  __type__: 'MidIRMoveMemStatement',
  memoryIndexExpression: memory.indexExpression,
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

/** Part 6: toString functions */

type MidIRExpressionLoose = MidIRExpression | MidIRExpression_DANGEROUSLY_NON_CANONICAL;
type MidIRStatementLoose =
  | MidIRStatement
  | MidIRStatement_DANGEROUSLY_NON_CANONICAL
  | MidIRStatementLessDangerouslyNonCanonical;

export const midIRExpressionToString = (expression: MidIRExpressionLoose): string => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
      return expression.value.toString();

    case 'MidIRNameExpression':
      return expression.name;

    case 'MidIRTemporaryExpression':
      return expression.temporaryID;

    case 'MidIRImmutableMemoryExpression':
      return `MEM[${midIRExpressionToString(expression.indexExpression)}]`;

    case 'MidIRBinaryExpression': {
      const e1 = midIRExpressionToString(expression.e1);
      const e2 = midIRExpressionToString(expression.e2);
      return `(${e1} ${expression.operator} ${e2})`;
    }

    case 'MidIRExpressionSequenceExpression': {
      const statementsString = expression.statements.map(midIRStatementToString).join(', ');
      const expressionString = midIRExpressionToString(expression.expression);
      return `ESEQ([${statementsString}], ${expressionString})`;
    }
  }
};

export const midIRStatementToString = (statement: MidIRStatementLoose): string => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return `${statement.temporaryID} = ${midIRExpressionToString(statement.source)};`;

    case 'MidIRMoveMemStatement': {
      const destination = midIRExpressionToString(statement.memoryIndexExpression);
      const source = midIRExpressionToString(statement.source);
      return `MEM[${destination}] = ${source};`;
    }

    case 'MidIRJumpStatement':
      return `goto ${statement.label};`;

    case 'MidIRLabelStatement':
      return `${statement.name}:`;

    case 'MidIRCallFunctionStatement': {
      const { functionExpression, functionArguments, returnCollectorTemporaryID } = statement;
      const functionExpressionString = midIRExpressionToString(functionExpression);
      const argumentsString = (functionArguments as MidIRExpressionLoose[])
        .map((it) => midIRExpressionToString(it))
        .join(', ');
      const functionCallString = `${functionExpressionString}(${argumentsString});`;
      if (returnCollectorTemporaryID == null) {
        return functionCallString;
      }
      return `${returnCollectorTemporaryID} = ${functionCallString}`;
    }

    case 'MidIRReturnStatement':
      return statement.returnedExpression == null
        ? 'return;'
        : `return ${midIRExpressionToString(statement.returnedExpression)};`;

    case 'MidIRConditionalJumpFallThrough': {
      const guard = midIRExpressionToString(statement.conditionExpression);
      return `if (${guard}) goto ${statement.label1};`;
    }

    case 'MidIRConditionalJumpNoFallThrough': {
      const guard = midIRExpressionToString(statement.conditionExpression);
      return `if (${guard}) goto ${statement.label1}; else goto ${statement.label2};`;
    }
  }
};

export const midIRFunctionToString = (midIRFunction: MidIRFunction): string => {
  const movingArgumentsString = midIRFunction.argumentNames
    .map((name, index) => `  let ${name} = _ARG${index};\n`)
    .join('');
  const mainBodyString = midIRFunction.mainBodyStatements
    .map((statement) => `  ${midIRStatementToString(statement)}\n`)
    .join('');
  const bodyString = `${movingArgumentsString}\n${mainBodyString}`;
  return `function ${midIRFunction.functionName} {\n${bodyString}}\n`;
};

export const midIRCompilationUnitToString = ({
  globalVariables,
  functions,
}: MidIRCompilationUnit): string => {
  const globalVariablesCode = globalVariables
    .map(({ name, content }) => `const ${name} = "${content}";\n`)
    .join('');
  const functionsCode = functions.map((it) => `${midIRFunctionToString(it)}`).join('\n');
  return `${globalVariablesCode}\n${functionsCode}`;
};
