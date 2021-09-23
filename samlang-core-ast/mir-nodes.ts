import { zip } from 'samlang-core-utils';

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

export interface MidIRIncreaseReferenceCountStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRIncreaseReferenceCountStatement';
  readonly expression: MidIRExpression;
}

export interface MidIRDecreaseReferenceCountStatement extends BaseMidIRStatement {
  readonly __type__: 'MidIRDecreaseReferenceCountStatement';
  readonly expression: MidIRExpression;
}

export type MidIRStatement =
  | MidIRBinaryStatement
  | MidIRIndexAccessStatement
  | MidIRFunctionCallStatement
  | MidIRIfElseStatement
  | MidIRSingleIfStatement
  | MidIRBreakStatement
  | MidIRWhileStatement
  | MidIRCastStatement
  | MidIRStructInitializationStatement
  | MidIRIncreaseReferenceCountStatement
  | MidIRDecreaseReferenceCountStatement;

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

export const MIR_INC_REF = (expression: MidIRExpression): MidIRIncreaseReferenceCountStatement => ({
  __type__: 'MidIRIncreaseReferenceCountStatement',
  expression,
});

export const MIR_DEC_REF = (expression: MidIRExpression): MidIRDecreaseReferenceCountStatement => ({
  __type__: 'MidIRDecreaseReferenceCountStatement',
  expression,
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

export function debugPrintMidIRSources({
  globalVariables,
  typeDefinitions,
  functions,
}: MidIRSources): string {
  function debugPrintMidIRStatement(statement: MidIRStatement, startLevel: number): string {
    const collector: string[] = [];
    let level = startLevel;
    let breakCollector: string | undefined = undefined;

    function printer(s: MidIRStatement) {
      switch (s.__type__) {
        case 'MidIRIndexAccessStatement': {
          const type = prettyPrintMidIRType(s.type);
          const pointerExpression = prettyPrintMidIRExpression(s.pointerExpression);
          collector.push(
            '  '.repeat(level),
            `let ${s.name}: ${type} = ${pointerExpression}[${s.index}];\n`
          );
          break;
        }
        case 'MidIRBinaryStatement': {
          const type = prettyPrintMidIRType(s.type);
          const e1 = prettyPrintMidIRExpression(s.e1);
          const e2 = prettyPrintMidIRExpression(s.e2);
          collector.push(
            '  '.repeat(level),
            `let ${s.name}: ${type} = ${e1} ${s.operator} ${e2};\n`
          );
          break;
        }
        case 'MidIRFunctionCallStatement': {
          const functionString = prettyPrintMidIRExpression(s.functionExpression);
          const argumentString = s.functionArguments.map(prettyPrintMidIRExpression).join(', ');
          const collectorString =
            s.returnCollector != null
              ? `let ${s.returnCollector}: ${prettyPrintMidIRType(s.returnType)} = `
              : '';
          collector.push(
            '  '.repeat(level),
            `${collectorString}${functionString}(${argumentString});\n`
          );
          break;
        }
        case 'MidIRIfElseStatement':
          s.finalAssignments.forEach((finalAssignment) => {
            const type = prettyPrintMidIRType(finalAssignment.type);
            collector.push('  '.repeat(level), `let ${finalAssignment.name}: ${type};\n`);
          });
          collector.push(
            '  '.repeat(level),
            `if (${prettyPrintMidIRExpression(s.booleanExpression)}) {\n`
          );
          level += 1;
          s.s1.forEach(printer);
          s.finalAssignments.forEach((finalAssignment) => {
            const v1 = prettyPrintMidIRExpression(finalAssignment.branch1Value);
            collector.push('  '.repeat(level), `${finalAssignment.name} = ${v1};\n`);
          });
          level -= 1;
          collector.push('  '.repeat(level), `} else {\n`);
          level += 1;
          s.s2.forEach(printer);
          s.finalAssignments.forEach((finalAssignment) => {
            const v2 = prettyPrintMidIRExpression(finalAssignment.branch2Value);
            collector.push('  '.repeat(level), `${finalAssignment.name} = ${v2};\n`);
          });
          level -= 1;
          collector.push('  '.repeat(level), `}\n`);
          break;
        case 'MidIRSingleIfStatement':
          collector.push(
            '  '.repeat(level),
            `if (${s.invertCondition ? '!' : ''}${prettyPrintMidIRExpression(
              s.booleanExpression
            )}) {\n`
          );
          level += 1;
          s.statements.forEach(printer);
          level -= 1;
          collector.push('  '.repeat(level), `}\n`);
          break;
        case 'MidIRBreakStatement':
          collector.push(
            '  '.repeat(level),
            `${breakCollector} = ${prettyPrintMidIRExpression(s.breakValue)};\n`
          );
          collector.push('  '.repeat(level), 'break;\n');
          break;
        case 'MidIRWhileStatement': {
          s.loopVariables.forEach((v) => {
            const type = prettyPrintMidIRType(v.type);
            collector.push(
              '  '.repeat(level),
              `let ${v.name}: ${type} = ${prettyPrintMidIRExpression(v.initialValue)};\n`
            );
          });
          const previousBreakCollector = breakCollector;
          breakCollector = s.breakCollector?.name;
          if (s.breakCollector != null) {
            const { name, type } = s.breakCollector;
            collector.push('  '.repeat(level), `let ${name}: ${prettyPrintMidIRType(type)};\n`);
          }
          collector.push('  '.repeat(level), `while (true) {\n`);
          level += 1;
          s.statements.forEach(printer);
          s.loopVariables.forEach((v) => {
            collector.push(
              '  '.repeat(level),
              `${v.name} = ${prettyPrintMidIRExpression(v.loopValue)};\n`
            );
          });
          level -= 1;
          collector.push('  '.repeat(level), '}\n');
          breakCollector = previousBreakCollector;
          break;
        }
        case 'MidIRCastStatement':
          collector.push(
            '  '.repeat(level),
            `let ${s.name}: ${prettyPrintMidIRType(s.type)} = ${prettyPrintMidIRExpression(
              s.assignedExpression
            )};\n`
          );
          break;
        case 'MidIRStructInitializationStatement': {
          const expressionString = s.expressionList.map(prettyPrintMidIRExpression).join(', ');
          collector.push(
            '  '.repeat(level),
            `let ${s.structVariableName}: ${prettyPrintMidIRType(
              s.type
            )} = [${expressionString}];\n`
          );
          break;
        }
        case 'MidIRIncreaseReferenceCountStatement':
          collector.push(
            '  '.repeat(level),
            `${prettyPrintMidIRExpression(s.expression)}[0] += 1;\n`
          );
          break;
        case 'MidIRDecreaseReferenceCountStatement':
          collector.push(
            '  '.repeat(level),
            `${prettyPrintMidIRExpression(s.expression)}[0] -= 1;\n`
          );
          break;
      }
    }

    printer(statement);

    return collector.join('').trimEnd();
  }

  return [
    ...globalVariables.map(
      ({ name, content }) => `const ${name} = [0, "${escapeDoubleQuotes(content)}"];\n`
    ),
    ...typeDefinitions.map(
      ({ identifier, mappings }) =>
        `type ${identifier} = (${mappings.map(prettyPrintMidIRType).join(', ')});\n`
    ),
    ...functions.map(
      ({
        name,
        parameters,
        type: { argumentTypes, returnType },
        body: bodyStatements,
        returnValue,
      }) => {
        const typedParameters = zip(parameters, argumentTypes)
          .map(
            ([parameter, parameterType]) => `${parameter}: ${prettyPrintMidIRType(parameterType)}`
          )
          .join(', ');
        const header = `function ${name}(${typedParameters}): ${prettyPrintMidIRType(
          returnType
        )} {`;
        const body = [
          ...bodyStatements.map((it) => debugPrintMidIRStatement(it, 1)),
          `  return ${prettyPrintMidIRExpression(returnValue)};`,
        ].join('\n');
        return `${header}\n${body}\n}\n`;
      }
    ),
  ].join('\n');
}

function prettyPrintMidIRFunction({
  name,
  parameters,
  type: functionType,
  body,
  returnValue,
}: MidIRFunction) {
  const statementStringCollector: string[] = [];
  let level = 1;
  let breakCollector: string | undefined = undefined;

  function prettyPrintMidIRStatementAsJSStatement(s: MidIRStatement): void {
    switch (s.__type__) {
      case 'MidIRIndexAccessStatement': {
        const type = prettyPrintMidIRType(s.type);
        const pointerString = prettyPrintMidIRExpression(s.pointerExpression);
        statementStringCollector.push(
          '  '.repeat(level),
          `/** @type {${type}} */\n`,
          '  '.repeat(level),
          `let ${s.name} = ${pointerString}[${s.index}];\n`
        );
        break;
      }
      case 'MidIRBinaryStatement': {
        const type = prettyPrintMidIRType(s.type);
        const e1 = prettyPrintMidIRExpression(s.e1);
        const e2 = prettyPrintMidIRExpression(s.e2);
        const binaryExpressionString = `${e1} ${s.operator} ${e2}`;
        const wrapped =
          s.operator === '/' ? `Math.floor(${binaryExpressionString})` : binaryExpressionString;
        statementStringCollector.push(
          '  '.repeat(level),
          `/** @type {${type}} */\n`,
          '  '.repeat(level),
          `let ${s.name} = ${wrapped};\n`
        );
        break;
      }
      case 'MidIRFunctionCallStatement': {
        const functionExpression = prettyPrintMidIRExpression(s.functionExpression);
        const functionArguments = s.functionArguments.map(prettyPrintMidIRExpression).join(', ');
        const functionCallString = `${functionExpression}(${functionArguments});`;
        if (s.returnCollector != null) {
          const type = prettyPrintMidIRType(s.returnType);
          statementStringCollector.push('  '.repeat(level), `/** @type {${type}} */\n`);
        }
        statementStringCollector.push(
          '  '.repeat(level),
          s.returnCollector == null
            ? functionCallString
            : `let ${s.returnCollector} = ${functionCallString}`,
          '\n'
        );
        break;
      }
      case 'MidIRIfElseStatement':
        s.finalAssignments.forEach((final) => {
          statementStringCollector.push(
            '  '.repeat(level),
            `/** @type {${prettyPrintMidIRType(final.type)}} */\n`,
            '  '.repeat(level),
            `let ${final.name};\n`
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
          statementStringCollector.push(
            '  '.repeat(level),
            `/** @type {${prettyPrintMidIRType(v.type)}} */\n`,
            '  '.repeat(level),
            `let ${v.name} = ${prettyPrintMidIRExpression(v.initialValue)};\n`
          );
        });
        const previousBreakCollector = breakCollector;
        breakCollector = s.breakCollector?.name;
        if (s.breakCollector != null) {
          statementStringCollector.push(
            '  '.repeat(level),
            `/** @type {${prettyPrintMidIRType(s.breakCollector.type)}} */\n`,
            '  '.repeat(level),
            `let ${s.breakCollector.name};\n`
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
          `let ${s.name} = /** @type {${type}} */ (${expression});\n`
        );
        break;
      }
      case 'MidIRStructInitializationStatement': {
        const type = prettyPrintMidIRType(s.type);
        const expressions = s.expressionList.map(prettyPrintMidIRExpression).join(', ');
        statementStringCollector.push(
          '  '.repeat(level),
          `/** @type {${type}} */\n`,
          '  '.repeat(level),
          `let ${s.structVariableName} = [${expressions}];\n`
        );
        break;
      }
      case 'MidIRIncreaseReferenceCountStatement': {
        statementStringCollector.push(
          '  '.repeat(level),
          `${prettyPrintMidIRExpression(s.expression)}[0] += 1;\n`
        );
        break;
      }
      case 'MidIRDecreaseReferenceCountStatement':
        statementStringCollector.push(
          '  '.repeat(level),
          `${prettyPrintMidIRExpression(s.expression)}[0] -= 1;\n`
        );
        break;
    }
  }

  const annotatedParameters = zip(parameters, functionType.argumentTypes)
    .map(([n, t]) => `/** @type {${prettyPrintMidIRType(t)}} */ ${n}`)
    .join(', ');
  const returnType = prettyPrintMidIRType(functionType.returnType);
  const header = `/** @returns {${returnType}} */\nfunction ${name}(${annotatedParameters}) {`;
  body.forEach(prettyPrintMidIRStatementAsJSStatement);
  statementStringCollector.push(`  return ${prettyPrintMidIRExpression(returnValue)};`);
  return `${header}\n${statementStringCollector.join('')}\n}\n`;
}

export function prettyPrintMidIRSourcesAsJSSources(sources: MidIRSources): string {
  return [
    ...sources.globalVariables.map(
      ({ name, content }) =>
        `/** @type {Str} */ const ${name} = [0, "${escapeDoubleQuotes(content)}"];\n`
    ),
    ...sources.typeDefinitions.map(
      ({ identifier, mappings }) =>
        `/** @typedef {[${mappings.map(prettyPrintMidIRType).join(', ')}]} ${identifier}  */\n`
    ),
    ...sources.functions.map(prettyPrintMidIRFunction),
  ].join('');
}
