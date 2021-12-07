import { zip } from '../utils';
import {
  ENCODED_FUNCTION_NAME_FREE,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_THROW,
} from './common-names';
import type { GlobalVariable } from './common-nodes';
import type { IROperator } from './common-operators';

export type MidIRPrimitiveType = {
  readonly __type__: 'PrimitiveType';
  readonly type: 'bool' | 'int' | 'any' | 'string';
};

export type MidIRIdentifierType = { readonly __type__: 'IdentifierType'; readonly name: string };

export type MidIRFunctionType = {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly MidIRType[];
  readonly returnType: MidIRType;
};

export type MidIRType = MidIRPrimitiveType | MidIRIdentifierType | MidIRFunctionType;

export const MIR_BOOL_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'bool' };
export const MIR_INT_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'int' };
export const MIR_ANY_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'any' };
export const MIR_STRING_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'string' };

export const MIR_IDENTIFIER_TYPE = (name: string): MidIRIdentifierType => ({
  __type__: 'IdentifierType',
  name,
});

export const MIR_FUNCTION_TYPE = (
  argumentTypes: readonly MidIRType[],
  returnType: MidIRType
): MidIRFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export function prettyPrintMidIRType(type: MidIRType): string {
  switch (type.__type__) {
    case 'PrimitiveType':
      switch (type.type) {
        case 'int':
          return 'number';
        case 'bool':
          return 'boolean';
        case 'string':
          return 'Str';
        default:
          return type.type;
      }
    case 'IdentifierType':
      return type.name;
    case 'FunctionType':
      return `(${type.argumentTypes
        .map((it, index) => `t${index}: ${prettyPrintMidIRType(it)}`)
        .join(', ')}) => ${prettyPrintMidIRType(type.returnType)}`;
  }
}

function standardizeMidIRTypeForComparison(t: MidIRType): MidIRType {
  return t.__type__ === 'PrimitiveType' && t.type === 'string' ? MIR_ANY_TYPE : t;
}

export function isTheSameMidIRType(type1: MidIRType, type2: MidIRType): boolean {
  const t1 = standardizeMidIRTypeForComparison(type1);
  const t2 = standardizeMidIRTypeForComparison(type2);
  switch (t1.__type__) {
    case 'PrimitiveType':
      return t2.__type__ === 'PrimitiveType' && t1.type === t2.type;
    case 'IdentifierType':
      return t2.__type__ === 'IdentifierType' && t1.name === t2.name;
    case 'FunctionType':
      return (
        t2.__type__ === 'FunctionType' &&
        isTheSameMidIRType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        zip(t1.argumentTypes, t2.argumentTypes).every(([t1Element, t2Element]) =>
          isTheSameMidIRType(t1Element, t2Element)
        )
      );
  }
}

interface BaseMidIRExpression {
  readonly __type__: string;
  readonly type: MidIRType;
}

export interface MidIRIntLiteralExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRIntLiteralExpression';
  readonly value: number;
}

export interface MidIRNameExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRNameExpression';
  readonly name: string;
}

export interface MidIRVariableExpression extends BaseMidIRExpression {
  readonly __type__: 'MidIRVariableExpression';
  readonly name: string;
}

export type MidIRExpression =
  | MidIRIntLiteralExpression
  | MidIRNameExpression
  | MidIRVariableExpression;

interface BaseMidIRStatement {
  readonly __type__: string;
}

export interface MidIRIndexAccessStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRIndexAccessStatement';
  readonly name: string;
  readonly type: MidIRType;
  readonly pointerExpression: MidIRExpression;
  readonly index: number;
}

export interface MidIRIndexAssignStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRIndexAssignStatement';
  readonly assignedExpression: MidIRVariableExpression;
  readonly pointerExpression: MidIRExpression;
  readonly index: number;
}

export interface MidIRBinaryStatement extends BaseMidIRExpression {
  readonly __type__: 'MidIRBinaryStatement';
  readonly name: string;
  readonly type: MidIRType;
  readonly operator: IROperator;
  readonly e1: MidIRExpression;
  readonly e2: MidIRExpression;
}

export interface MidIRFunctionCallStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRFunctionCallStatement';
  readonly functionExpression: MidIRExpression;
  readonly functionArguments: readonly MidIRExpression[];
  readonly returnType: MidIRType;
  readonly returnCollector?: string;
}

export interface MidIRIfElseStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRIfElseStatement';
  readonly booleanExpression: MidIRExpression;
  readonly s1: readonly MidIRStatement[];
  readonly s2: readonly MidIRStatement[];
  readonly finalAssignments: readonly {
    readonly name: string;
    readonly type: MidIRType;
    readonly branch1Value: MidIRExpression;
    readonly branch2Value: MidIRExpression;
  }[];
}

export interface MidIRSingleIfStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRSingleIfStatement';
  readonly booleanExpression: MidIRExpression;
  readonly invertCondition: boolean;
  readonly statements: readonly MidIRStatement[];
}

export interface MidIRBreakStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRBreakStatement';
  readonly breakValue: MidIRExpression;
}

export interface GeneralMidIRLoopVariables {
  readonly name: string;
  readonly type: MidIRType;
  readonly initialValue: MidIRExpression;
  readonly loopValue: MidIRExpression;
}

export interface MidIRWhileStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRWhileStatement';
  readonly loopVariables: readonly GeneralMidIRLoopVariables[];
  readonly statements: readonly MidIRStatement[];
  readonly breakCollector?: { readonly name: string; readonly type: MidIRType };
}

export interface MidIRCastStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRCastStatement';
  readonly name: string;
  readonly type: MidIRType;
  readonly assignedExpression: MidIRExpression;
}

export interface MidIRStructInitializationStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRStructInitializationStatement';
  readonly structVariableName: string;
  readonly type: MidIRType;
  readonly expressionList: readonly MidIRExpression[];
}

export type MidIRStatement =
  | MidIRBinaryStatement
  | MidIRIndexAccessStatement
  | MidIRIndexAssignStatement
  | MidIRFunctionCallStatement
  | MidIRIfElseStatement
  | MidIRSingleIfStatement
  | MidIRBreakStatement
  | MidIRWhileStatement
  | MidIRCastStatement
  | MidIRStructInitializationStatement;

type ConstructorArgumentObject<E extends BaseMidIRExpression | BaseMidIRStatement> = Omit<
  E,
  '__type__'
>;

export const MIR_FALSE: MidIRIntLiteralExpression = {
  __type__: 'MidIRIntLiteralExpression',
  type: MIR_BOOL_TYPE,
  value: 0,
};

export const MIR_TRUE: MidIRIntLiteralExpression = {
  __type__: 'MidIRIntLiteralExpression',
  type: MIR_BOOL_TYPE,
  value: 1,
};

export const MIR_INT = (value: number): MidIRIntLiteralExpression => ({
  __type__: 'MidIRIntLiteralExpression',
  type: MIR_INT_TYPE,
  value,
});

export const MIR_ZERO: MidIRIntLiteralExpression = MIR_INT(0);
export const MIR_ONE: MidIRIntLiteralExpression = MIR_INT(1);

export const MIR_NAME = (name: string, type: MidIRType): MidIRNameExpression => ({
  __type__: 'MidIRNameExpression',
  type,
  name,
});

export const MIR_VARIABLE = (name: string, type: MidIRType): MidIRVariableExpression => ({
  __type__: 'MidIRVariableExpression',
  type,
  name,
});

export function MIR_BINARY({
  name,
  operator,
  e1,
  e2,
}: Omit<ConstructorArgumentObject<MidIRBinaryStatement>, 'type'>): MidIRBinaryStatement {
  let type: MidIRType;
  switch (operator) {
    case '*':
    case '/':
    case '%':
    case '+':
    case '-':
      type = MIR_INT_TYPE;
      break;
    case '^':
    case '<':
    case '>':
    case '<=':
    case '>=':
    case '==':
    case '!=':
      type = MIR_BOOL_TYPE;
      break;
  }
  if (operator === '-' && e2.__type__ === 'MidIRIntLiteralExpression') {
    const negOfE2Constant = -e2.value;
    if (negOfE2Constant !== 2147483648) {
      return {
        __type__: 'MidIRBinaryStatement',
        name,
        type,
        operator: '+',
        e1,
        e2: MIR_INT(negOfE2Constant),
      };
    }
  }
  return { __type__: 'MidIRBinaryStatement', name, type, operator, e1, e2 };
}

export const MIR_INDEX_ACCESS = ({
  name,
  type,
  pointerExpression,
  index,
}: ConstructorArgumentObject<MidIRIndexAccessStatement>): MidIRIndexAccessStatement => ({
  __type__: 'MidIRIndexAccessStatement',
  name,
  type,
  pointerExpression,
  index,
});

export const MIR_INDEX_ASSIGN = ({
  assignedExpression,
  pointerExpression,
  index,
}: ConstructorArgumentObject<MidIRIndexAssignStatement>): MidIRIndexAssignStatement => ({
  __type__: 'MidIRIndexAssignStatement',
  assignedExpression,
  pointerExpression,
  index,
});

export const MIR_FUNCTION_CALL = ({
  functionExpression,
  functionArguments,
  returnType,
  returnCollector,
}: ConstructorArgumentObject<MidIRFunctionCallStatement>): MidIRFunctionCallStatement => ({
  __type__: 'MidIRFunctionCallStatement',
  functionExpression,
  functionArguments,
  returnType,
  returnCollector,
});

export const MIR_IF_ELSE = ({
  booleanExpression,
  s1,
  s2,
  finalAssignments,
}: ConstructorArgumentObject<MidIRIfElseStatement>): MidIRIfElseStatement => ({
  __type__: 'MidIRIfElseStatement',
  booleanExpression,
  s1,
  s2,
  finalAssignments,
});

export const MIR_SINGLE_IF = ({
  booleanExpression,
  invertCondition,
  statements,
}: ConstructorArgumentObject<MidIRSingleIfStatement>): MidIRSingleIfStatement => ({
  __type__: 'MidIRSingleIfStatement',
  booleanExpression,
  invertCondition,
  statements,
});

export const MIR_BREAK = (breakValue: MidIRExpression): MidIRBreakStatement => ({
  __type__: 'MidIRBreakStatement',
  breakValue,
});

export const MIR_WHILE = ({
  loopVariables,
  statements,
  breakCollector,
}: ConstructorArgumentObject<MidIRWhileStatement>): MidIRWhileStatement => ({
  __type__: 'MidIRWhileStatement',
  loopVariables,
  statements,
  breakCollector,
});

export const MIR_CAST = ({
  name,
  type,
  assignedExpression,
}: ConstructorArgumentObject<MidIRCastStatement>): MidIRCastStatement => ({
  __type__: 'MidIRCastStatement',
  name,
  type,
  assignedExpression,
});

export const MIR_STRUCT_INITIALIZATION = ({
  structVariableName,
  type,
  expressionList,
}: ConstructorArgumentObject<MidIRStructInitializationStatement>): MidIRStructInitializationStatement => ({
  __type__: 'MidIRStructInitializationStatement',
  structVariableName,
  type,
  expressionList,
});

function prettyPrintMidIRExpression(expression: MidIRExpression): string {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
      if (expression.type.__type__ === 'PrimitiveType' && expression.type.type === 'bool') {
        return String(Boolean(expression.value));
      }
      return expression.value.toString();
    case 'MidIRVariableExpression':
    case 'MidIRNameExpression':
      return expression.name;
  }
}

export interface MidIRTypeDefinition {
  readonly identifier: string;
  readonly mappings: readonly MidIRType[];
}

export interface MidIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly type: MidIRFunctionType;
  readonly body: readonly MidIRStatement[];
  readonly returnValue: MidIRExpression;
}

export interface MidIRSources {
  readonly globalVariables: readonly GlobalVariable[];
  readonly typeDefinitions: readonly MidIRTypeDefinition[];
  readonly mainFunctionNames: readonly string[];
  readonly functions: readonly MidIRFunction[];
}

// Thanks https://gist.github.com/getify/3667624
const escapeDoubleQuotes = (string: string) => string.replace(/\\([\s\S])|(")/g, '\\$1$2');

function prettyPrintMidIRFunction(
  { name, parameters, type: functionType, body, returnValue }: MidIRFunction,
  typed: boolean
) {
  const statementStringCollector: string[] = [];
  let level = 1;
  let breakCollector: string | undefined = undefined;

  function prettyPrintMidIRTypeAnnotation(type: MidIRType) {
    if (!typed) return '';
    return `: ${prettyPrintMidIRType(type)}`;
  }

  function prettyPrintMidIRStatementAsJSStatement(s: MidIRStatement): void {
    switch (s.__type__) {
      case 'MidIRIndexAccessStatement': {
        const type = prettyPrintMidIRTypeAnnotation(s.type);
        const pointerString = prettyPrintMidIRExpression(s.pointerExpression);
        statementStringCollector.push(
          '  '.repeat(level),
          `let ${s.name}${type} = ${pointerString}[${s.index}];\n`
        );
        break;
      }
      case 'MidIRIndexAssignStatement': {
        const assignedString = prettyPrintMidIRExpression(s.assignedExpression);
        const pointerString = prettyPrintMidIRExpression(s.pointerExpression);
        statementStringCollector.push(
          '  '.repeat(level),
          `${pointerString}[${s.index}] = ${assignedString};\n`
        );
        break;
      }
      case 'MidIRBinaryStatement': {
        const type = prettyPrintMidIRTypeAnnotation(s.type);
        const e1 = prettyPrintMidIRExpression(s.e1);
        const e2 = prettyPrintMidIRExpression(s.e2);
        const binaryExpressionString = `${e1} ${s.operator} ${e2}`;
        const wrapped =
          s.operator === '/' ? `Math.floor(${binaryExpressionString})` : binaryExpressionString;
        statementStringCollector.push('  '.repeat(level), `let ${s.name}${type} = ${wrapped};\n`);
        break;
      }
      case 'MidIRFunctionCallStatement': {
        const functionExpression = prettyPrintMidIRExpression(s.functionExpression);
        const functionArguments = s.functionArguments.map(prettyPrintMidIRExpression).join(', ');
        const functionCallString = `${functionExpression}(${functionArguments});`;
        statementStringCollector.push(
          '  '.repeat(level),
          s.returnCollector == null
            ? functionCallString
            : `let ${s.returnCollector}${prettyPrintMidIRTypeAnnotation(
                s.returnType
              )} = ${functionCallString}`,
          '\n'
        );
        break;
      }
      case 'MidIRIfElseStatement':
        s.finalAssignments.forEach((final) => {
          statementStringCollector.push(
            '  '.repeat(level),
            `let ${final.name}${prettyPrintMidIRTypeAnnotation(final.type)};\n`
          );
        });
        statementStringCollector.push(
          '  '.repeat(level),
          `if (${prettyPrintMidIRExpression(s.booleanExpression)}) {\n`
        );
        level += 1;
        s.s1.forEach(prettyPrintMidIRStatementAsJSStatement);
        s.finalAssignments.forEach((finalAssignment) => {
          const v1 = prettyPrintMidIRExpression(finalAssignment.branch1Value);
          statementStringCollector.push('  '.repeat(level), `${finalAssignment.name} = ${v1};\n`);
        });
        level -= 1;
        statementStringCollector.push('  '.repeat(level), `} else {\n`);
        level += 1;
        s.s2.forEach(prettyPrintMidIRStatementAsJSStatement);
        s.finalAssignments.forEach((finalAssignment) => {
          const v2 = prettyPrintMidIRExpression(finalAssignment.branch2Value);
          statementStringCollector.push('  '.repeat(level), `${finalAssignment.name} = ${v2};\n`);
        });
        level -= 1;
        statementStringCollector.push('  '.repeat(level), '}\n');
        break;
      case 'MidIRSingleIfStatement':
        statementStringCollector.push(
          '  '.repeat(level),
          `if (${s.invertCondition ? '!' : ''}${prettyPrintMidIRExpression(
            s.booleanExpression
          )}) {\n`
        );
        level += 1;
        s.statements.forEach(prettyPrintMidIRStatementAsJSStatement);
        level -= 1;
        statementStringCollector.push('  '.repeat(level), `}\n`);
        break;
      case 'MidIRBreakStatement':
        if (breakCollector != null) {
          statementStringCollector.push(
            '  '.repeat(level),
            `${breakCollector} = ${prettyPrintMidIRExpression(s.breakValue)};\n`
          );
        }
        statementStringCollector.push('  '.repeat(level), 'break;\n');
        break;
      case 'MidIRWhileStatement': {
        s.loopVariables.forEach((v) => {
          const type = prettyPrintMidIRTypeAnnotation(v.type);
          statementStringCollector.push(
            '  '.repeat(level),
            `let ${v.name}${type} = ${prettyPrintMidIRExpression(v.initialValue)};\n`
          );
        });
        const previousBreakCollector = breakCollector;
        breakCollector = s.breakCollector?.name;
        if (s.breakCollector != null) {
          const type = prettyPrintMidIRTypeAnnotation(s.breakCollector.type);
          statementStringCollector.push(
            '  '.repeat(level),
            `let ${s.breakCollector.name}${type};\n`
          );
        }
        statementStringCollector.push('  '.repeat(level), `while (true) {\n`);
        level += 1;
        s.statements.forEach(prettyPrintMidIRStatementAsJSStatement);
        s.loopVariables.forEach((v) => {
          statementStringCollector.push(
            '  '.repeat(level),
            `${v.name} = ${prettyPrintMidIRExpression(v.loopValue)};\n`
          );
        });
        level -= 1;
        statementStringCollector.push('  '.repeat(level), '}\n');
        breakCollector = previousBreakCollector;
        break;
      }
      case 'MidIRCastStatement': {
        const type = prettyPrintMidIRType(s.type);
        const expression = prettyPrintMidIRExpression(s.assignedExpression);
        statementStringCollector.push(
          '  '.repeat(level),
          typed
            ? `let ${s.name} = ${expression} as ${type};\n`
            : `let ${s.name} = /** @type {${type}} */ (${expression});\n`
        );
        break;
      }
      case 'MidIRStructInitializationStatement': {
        const type = prettyPrintMidIRTypeAnnotation(s.type);
        const expressions = s.expressionList.map(prettyPrintMidIRExpression).join(', ');
        statementStringCollector.push(
          '  '.repeat(level),
          `let ${s.structVariableName}${type} = [${expressions}];\n`
        );
        break;
      }
    }
  }

  const annotatedParameters = zip(parameters, functionType.argumentTypes)
    .map(([n, t]) => `${n}${prettyPrintMidIRTypeAnnotation(t)}`)
    .join(', ');
  const returnType = prettyPrintMidIRTypeAnnotation(functionType.returnType);
  const header = `function ${name}(${annotatedParameters})${returnType} {`;
  body.forEach(prettyPrintMidIRStatementAsJSStatement);
  statementStringCollector.push(`  return ${prettyPrintMidIRExpression(returnValue)};`);
  return `${header}\n${statementStringCollector.join('')}\n}\n`;
}

export function prettyPrintMidIRSourcesAsTSSources({
  globalVariables,
  typeDefinitions,
  functions,
}: MidIRSources): string {
  const collector: string[] = [
    `type Str = [number, string];
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([, line]: Str): number => { console.log(line); return 0; };
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([, v]: Str): number => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v: number): Str => [1, String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = ([, v]: Str): number => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v: unknown): number => 0;
`,
  ];
  globalVariables.forEach(({ name, content }) =>
    collector.push(`const ${name}: Str = [0, "${escapeDoubleQuotes(content)}"];\n`)
  );
  typeDefinitions.forEach(({ identifier, mappings }) =>
    collector.push(`type ${identifier} = [${mappings.map(prettyPrintMidIRType).join(', ')}];\n`)
  );
  functions.forEach((it) => collector.push(prettyPrintMidIRFunction(it, true)));
  return collector.join('');
}

export function prettyPrintMidIRSourcesAsJSSources(sources: MidIRSources): string {
  const collector: string[] = [];
  sources.globalVariables.forEach(({ name, content }) =>
    collector.push(`/** @type {Str} */ const ${name} = [0, "${escapeDoubleQuotes(content)}"];\n`)
  );
  sources.typeDefinitions.forEach(({ identifier, mappings }) =>
    collector.push(
      `/** @typedef {[${mappings.map(prettyPrintMidIRType).join(', ')}]} ${identifier}  */\n`
    )
  );
  sources.functions.forEach((it) => collector.push(prettyPrintMidIRFunction(it, false)));
  return collector.join('');
}
