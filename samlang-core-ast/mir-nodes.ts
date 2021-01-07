/* eslint-disable camelcase */

/** Part 1: Type Imports */

import type { GlobalVariable } from './common-nodes';
import { HighIRExpression, debugPrintHighIRExpressionUntyped } from './hir-expressions';

/** Part 3: Statements */

interface BaseMidIRStatement {
  readonly __type__: string;
}

export interface MidIRMoveTempStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRMoveTempStatement';
  readonly temporaryID: string;
  readonly source: HighIRExpression;
}

export interface MidIRMoveMemStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRMoveMemStatement';
  readonly memoryIndexExpression: HighIRExpression;
  readonly source: HighIRExpression;
}

export interface MidIRJumpStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRJumpStatement';
  readonly label: string;
}

export interface MidIRLabelStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRLabelStatement';
  readonly name: string;
}

export interface MidIRCallFunctionStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRCallFunctionStatement';
  readonly functionExpression: HighIRExpression;
  readonly functionArguments: readonly HighIRExpression[];
  readonly returnCollectorTemporaryID?: string;
}

export interface MidIRReturnStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRReturnStatement';
  readonly returnedExpression: HighIRExpression;
}

export interface MidIRConditionalJumpFallThrough extends BaseMidIRStatement {
  readonly __type__: 'MidIRConditionalJumpFallThrough';
  readonly conditionExpression: HighIRExpression;
  readonly label1: string;
}

export interface MidIRConditionalJumpNoFallThrough extends BaseMidIRStatement {
  readonly __type__: 'MidIRConditionalJumpNoFallThrough';
  readonly conditionExpression: HighIRExpression;
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

/** Give it a scary name so we don't construct it after the first lowering of first pass. */
export type MidIRStatement_DANGEROUSLY_NON_CANONICAL =
  | MidIRMoveTempStatement
  | MidIRMoveMemStatement
  | MidIRJumpStatement
  | MidIRLabelStatement
  | MidIRCallFunctionStatement
  | MidIRReturnStatement
  | MidIRConditionalJumpNoFallThrough;

/** Part 4: Top Levels */

export interface MidIRFunction {
  readonly functionName: string;
  readonly argumentNames: readonly string[];
  readonly mainBodyStatements: readonly MidIRStatement[];
}

export interface MidIRCompilationUnit {
  readonly globalVariables: readonly GlobalVariable[];
  readonly functions: readonly MidIRFunction[];
}

/** Part 5: Constructors */

export const MIR_MOVE_TEMP = (
  temporaryID: string,
  source: HighIRExpression
): MidIRMoveTempStatement => ({
  __type__: 'MidIRMoveTempStatement',
  temporaryID,
  source,
});

export const MIR_MOVE_IMMUTABLE_MEM = (
  memoryIndexExpression: HighIRExpression,
  source: HighIRExpression
): MidIRMoveMemStatement => ({
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

export const MIR_CALL_FUNCTION = (
  functionExpression: HighIRExpression,
  functionArguments: readonly HighIRExpression[],
  returnCollectorTemporaryID?: string
): MidIRCallFunctionStatement => ({
  __type__: 'MidIRCallFunctionStatement',
  functionExpression,
  functionArguments,
  returnCollectorTemporaryID,
});

export const MIR_RETURN = (returnedExpression: HighIRExpression): MidIRReturnStatement => ({
  __type__: 'MidIRReturnStatement',
  returnedExpression,
});

export const MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL = (
  conditionExpression: HighIRExpression,
  label1: string,
  label2: string
): MidIRConditionalJumpNoFallThrough => ({
  __type__: 'MidIRConditionalJumpNoFallThrough',
  conditionExpression,
  label1,
  label2,
});

export const MIR_CJUMP_FALLTHROUGH = (
  conditionExpression: HighIRExpression,
  label1: string
): MidIRConditionalJumpFallThrough => ({
  __type__: 'MidIRConditionalJumpFallThrough',
  conditionExpression,
  label1,
});

/** Part 6: toString functions */

type MidIRStatementLoose = MidIRStatement | MidIRStatement_DANGEROUSLY_NON_CANONICAL;

export const midIRStatementToString = (statement: MidIRStatementLoose): string => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return `${statement.temporaryID} = ${debugPrintHighIRExpressionUntyped(statement.source)};`;

    case 'MidIRMoveMemStatement': {
      const destination = debugPrintHighIRExpressionUntyped(statement.memoryIndexExpression);
      const source = debugPrintHighIRExpressionUntyped(statement.source);
      return `MEM[${destination}] = ${source};`;
    }

    case 'MidIRJumpStatement':
      return `goto ${statement.label};`;

    case 'MidIRLabelStatement':
      return `${statement.name}:`;

    case 'MidIRCallFunctionStatement': {
      const { functionExpression, functionArguments, returnCollectorTemporaryID } = statement;
      const functionExpressionString = debugPrintHighIRExpressionUntyped(functionExpression);
      const argumentsString = functionArguments
        .map((it) => debugPrintHighIRExpressionUntyped(it))
        .join(', ');
      const functionCallString = `${functionExpressionString}(${argumentsString});`;
      if (returnCollectorTemporaryID == null) {
        return functionCallString;
      }
      return `${returnCollectorTemporaryID} = ${functionCallString}`;
    }

    case 'MidIRReturnStatement':
      return `return ${debugPrintHighIRExpressionUntyped(statement.returnedExpression)};`;

    case 'MidIRConditionalJumpFallThrough': {
      const guard = debugPrintHighIRExpressionUntyped(statement.conditionExpression);
      return `if (${guard}) goto ${statement.label1};`;
    }

    case 'MidIRConditionalJumpNoFallThrough': {
      const guard = debugPrintHighIRExpressionUntyped(statement.conditionExpression);
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
