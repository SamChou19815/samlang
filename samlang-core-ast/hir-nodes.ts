import { zip } from 'samlang-core-utils';

import type { GlobalVariable } from './common-nodes';
import type { IROperator } from './common-operators';

export interface HighIRPrimitiveType {
  readonly __type__: 'PrimitiveType';
  readonly type: 'bool' | 'int' | 'string';
}

export interface HighIRIdentifierType {
  readonly __type__: 'IdentifierType';
  readonly name: string;
  readonly typeArguments: readonly HighIRType[];
}

export interface HighIRFunctionType {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly HighIRType[];
  readonly returnType: HighIRType;
}

export type HighIRType = HighIRPrimitiveType | HighIRIdentifierType | HighIRFunctionType;

export const HIR_BOOL_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'bool' };
export const HIR_INT_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'int' };
export const HIR_STRING_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'string' };

export const HIR_IDENTIFIER_TYPE = (
  name: string,
  typeArguments: readonly HighIRType[]
): HighIRIdentifierType => ({
  __type__: 'IdentifierType',
  name,
  typeArguments,
});

export const HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS = (name: string): HighIRIdentifierType => ({
  __type__: 'IdentifierType',
  name,
  typeArguments: [],
});

export const HIR_FUNCTION_TYPE = (
  argumentTypes: readonly HighIRType[],
  returnType: HighIRType
): HighIRFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export function prettyPrintHighIRType(type: HighIRType): string {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'IdentifierType':
      return type.typeArguments.length === 0
        ? type.name
        : `${type.name}<${type.typeArguments.map(prettyPrintHighIRType).join(', ')}>`;
    case 'FunctionType':
      return `(${type.argumentTypes
        .map(prettyPrintHighIRType)
        .join(', ')}) -> ${prettyPrintHighIRType(type.returnType)}`;
  }
}

export interface HighIRClosureTypeDefinition {
  readonly identifier: string;
  readonly typeParameters: readonly string[];
  readonly functionType: HighIRFunctionType;
}

const nameWithTypeParameter = (identifier: string, typeParameters: readonly string[]): string =>
  typeParameters.length === 0 ? identifier : `${identifier}<${typeParameters.join(', ')}>`;

export function prettyPrintHighIRClosureTypeDefinition({
  identifier,
  typeParameters,
  functionType,
}: HighIRClosureTypeDefinition): string {
  return `closure type ${nameWithTypeParameter(
    identifier,
    typeParameters
  )} = ${prettyPrintHighIRType(functionType)}`;
}

export interface HighIRTypeDefinition {
  readonly identifier: string;
  readonly type: 'object' | 'variant';
  readonly typeParameters: readonly string[];
  readonly mappings: readonly HighIRType[];
}

export function prettyPrintHighIRTypeDefinition({
  identifier,
  type,
  typeParameters,
  mappings,
}: HighIRTypeDefinition): string {
  const idPart = nameWithTypeParameter(identifier, typeParameters);
  return `${type} type ${idPart} = [${mappings.map(prettyPrintHighIRType).join(', ')}]`;
}

interface BaseHighIRExpression {
  readonly __type__: string;
  readonly type: HighIRType;
}

export interface HighIRIntLiteralExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRIntLiteralExpression';
  readonly value: number;
}

export interface HighIRNameExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRNameExpression';
  readonly name: string;
  readonly type: HighIRPrimitiveType | HighIRFunctionType;
}

export interface HighIRVariableExpression extends BaseHighIRExpression {
  readonly __type__: 'HighIRVariableExpression';
  readonly name: string;
}

export type HighIRExpression =
  | HighIRIntLiteralExpression
  | HighIRNameExpression
  | HighIRVariableExpression;

interface BaseHighIRStatement {
  readonly __type__: string;
}

export interface HighIRIndexAccessStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIndexAccessStatement';
  readonly name: string;
  readonly type: HighIRType;
  readonly pointerExpression: HighIRExpression;
  readonly index: number;
}

export interface HighIRBinaryStatement extends BaseHighIRExpression {
  readonly __type__: 'HighIRBinaryStatement';
  readonly name: string;
  readonly type: HighIRType;
  readonly operator: IROperator;
  readonly e1: HighIRExpression;
  readonly e2: HighIRExpression;
}

export interface HighIRFunctionCallStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRFunctionCallStatement';
  /** When `functionExpression` is a variable, it's interpreted as a closure call. */
  readonly functionExpression: HighIRNameExpression | HighIRVariableExpression;
  readonly functionArguments: readonly HighIRExpression[];
  readonly returnType: HighIRType;
  readonly returnCollector?: string;
}

export interface HighIRIfElseStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIfElseStatement';
  readonly booleanExpression: HighIRExpression;
  readonly s1: readonly HighIRStatement[];
  readonly s2: readonly HighIRStatement[];
  readonly finalAssignments: readonly {
    readonly name: string;
    readonly type: HighIRType;
    readonly branch1Value: HighIRExpression;
    readonly branch2Value: HighIRExpression;
  }[];
}

export interface HighIRSingleIfStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRSingleIfStatement';
  readonly booleanExpression: HighIRExpression;
  readonly invertCondition: boolean;
  readonly statements: readonly HighIRStatement[];
}

export interface HighIRBreakStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRBreakStatement';
  readonly breakValue: HighIRExpression;
}

export interface GeneralHighIRLoopVariables {
  readonly name: string;
  readonly type: HighIRType;
  readonly initialValue: HighIRExpression;
  readonly loopValue: HighIRExpression;
}

export interface HighIRWhileStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRWhileStatement';
  readonly loopVariables: readonly GeneralHighIRLoopVariables[];
  readonly statements: readonly HighIRStatement[];
  readonly breakCollector?: { readonly name: string; readonly type: HighIRType };
}

export interface HighIRStructInitializationStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRStructInitializationStatement';
  readonly structVariableName: string;
  readonly type: HighIRIdentifierType;
  readonly expressionList: readonly HighIRExpression[];
}

export interface HighIRClosureInitializationStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRClosureInitializationStatement';
  readonly closureVariableName: string;
  readonly closureType: HighIRIdentifierType;
  readonly functionName: string;
  readonly functionType: HighIRFunctionType;
  readonly context: HighIRExpression;
}

export type HighIRStatement =
  | HighIRBinaryStatement
  | HighIRIndexAccessStatement
  | HighIRFunctionCallStatement
  | HighIRIfElseStatement
  | HighIRSingleIfStatement
  | HighIRBreakStatement
  | HighIRWhileStatement
  | HighIRStructInitializationStatement
  | HighIRClosureInitializationStatement;

type ConstructorArgumentObject<E extends BaseHighIRExpression | BaseHighIRStatement> = Omit<
  E,
  '__type__'
>;

export const HIR_FALSE: HighIRIntLiteralExpression = {
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_BOOL_TYPE,
  value: 0,
};

export const HIR_TRUE: HighIRIntLiteralExpression = {
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_BOOL_TYPE,
  value: 1,
};

export const HIR_INT = (value: number): HighIRIntLiteralExpression => ({
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_INT_TYPE,
  value,
});

export const HIR_ZERO: HighIRIntLiteralExpression = HIR_INT(0);
export const HIR_ONE: HighIRIntLiteralExpression = HIR_INT(1);

export const HIR_NAME = (
  name: string,
  type: HighIRPrimitiveType | HighIRFunctionType
): HighIRNameExpression => ({
  __type__: 'HighIRNameExpression',
  type,
  name,
});

export const HIR_VARIABLE = (name: string, type: HighIRType): HighIRVariableExpression => ({
  __type__: 'HighIRVariableExpression',
  type,
  name,
});

function getBinaryOperatorResultType(operator: IROperator): HighIRType {
  switch (operator) {
    case '*':
    case '/':
    case '%':
    case '+':
    case '-':
      return HIR_INT_TYPE;
    case '^':
    case '<':
    case '>':
    case '<=':
    case '>=':
    case '==':
    case '!=':
      return HIR_BOOL_TYPE;
  }
}

export function HIR_BINARY({
  name,
  operator,
  e1,
  e2,
}: Omit<ConstructorArgumentObject<HighIRBinaryStatement>, 'type'>): HighIRBinaryStatement {
  const type = getBinaryOperatorResultType(operator);
  if (operator === '-' && e2.__type__ === 'HighIRIntLiteralExpression') {
    const negOfE2Constant = -e2.value;
    if (negOfE2Constant !== 2147483648) {
      return {
        __type__: 'HighIRBinaryStatement',
        name,
        type,
        operator: '+',
        e1,
        e2: HIR_INT(negOfE2Constant),
      };
    }
  }
  return { __type__: 'HighIRBinaryStatement', name, type, operator, e1, e2 };
}

export const HIR_INDEX_ACCESS = ({
  name,
  type,
  pointerExpression,
  index,
}: ConstructorArgumentObject<HighIRIndexAccessStatement>): HighIRIndexAccessStatement => ({
  __type__: 'HighIRIndexAccessStatement',
  name,
  type,
  pointerExpression,
  index,
});

export const HIR_FUNCTION_CALL = ({
  functionExpression,
  functionArguments,
  returnType,
  returnCollector,
}: ConstructorArgumentObject<HighIRFunctionCallStatement>): HighIRFunctionCallStatement => ({
  __type__: 'HighIRFunctionCallStatement',
  functionExpression,
  functionArguments,
  returnType,
  returnCollector,
});

export const HIR_IF_ELSE = ({
  booleanExpression,
  s1,
  s2,
  finalAssignments,
}: ConstructorArgumentObject<HighIRIfElseStatement>): HighIRIfElseStatement => ({
  __type__: 'HighIRIfElseStatement',
  booleanExpression,
  s1,
  s2,
  finalAssignments,
});

export const HIR_SINGLE_IF = ({
  booleanExpression,
  invertCondition,
  statements,
}: ConstructorArgumentObject<HighIRSingleIfStatement>): HighIRSingleIfStatement => ({
  __type__: 'HighIRSingleIfStatement',
  booleanExpression,
  invertCondition,
  statements,
});

export const HIR_BREAK = (breakValue: HighIRExpression): HighIRBreakStatement => ({
  __type__: 'HighIRBreakStatement',
  breakValue,
});

export const HIR_WHILE = ({
  loopVariables,
  statements,
  breakCollector,
}: ConstructorArgumentObject<HighIRWhileStatement>): HighIRWhileStatement => ({
  __type__: 'HighIRWhileStatement',
  loopVariables,
  statements,
  breakCollector,
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

export const HIR_CLOSURE_INITIALIZATION = ({
  closureVariableName,
  closureType,
  functionName,
  functionType,
  context,
}: ConstructorArgumentObject<HighIRClosureInitializationStatement>): HighIRClosureInitializationStatement => ({
  __type__: 'HighIRClosureInitializationStatement',
  closureVariableName,
  closureType,
  functionName,
  functionType,
  context,
});

export function debugPrintHighIRExpression(expression: HighIRExpression): string {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
      return expression.value.toString();
    case 'HighIRVariableExpression':
      return `(${expression.name}: ${prettyPrintHighIRType(expression.type)})`;
    case 'HighIRNameExpression':
      return expression.name;
  }
}

export function debugPrintHighIRStatement(statement: HighIRStatement, startLevel = 0): string {
  const collector: string[] = [];
  let level = startLevel;
  let breakCollector: string | undefined = undefined;

  function printer(s: HighIRStatement) {
    switch (s.__type__) {
      case 'HighIRIndexAccessStatement': {
        const type = prettyPrintHighIRType(s.type);
        const pointerExpression = debugPrintHighIRExpression(s.pointerExpression);
        collector.push(
          '  '.repeat(level),
          `let ${s.name}: ${type} = ${pointerExpression}[${s.index}];\n`
        );
        return;
      }
      case 'HighIRBinaryStatement': {
        const type = prettyPrintHighIRType(s.type);
        const e1 = debugPrintHighIRExpression(s.e1);
        const e2 = debugPrintHighIRExpression(s.e2);
        collector.push('  '.repeat(level), `let ${s.name}: ${type} = ${e1} ${s.operator} ${e2};\n`);
        return;
      }
      case 'HighIRFunctionCallStatement': {
        const functionString = debugPrintHighIRExpression(s.functionExpression);
        const argumentString = s.functionArguments.map(debugPrintHighIRExpression).join(', ');
        const collectorString =
          s.returnCollector != null
            ? `let ${s.returnCollector}: ${prettyPrintHighIRType(s.returnType)} = `
            : '';
        collector.push(
          '  '.repeat(level),
          `${collectorString}${functionString}(${argumentString});\n`
        );
        return;
      }
      case 'HighIRIfElseStatement':
        s.finalAssignments.forEach((finalAssignment) => {
          const type = prettyPrintHighIRType(finalAssignment.type);
          collector.push('  '.repeat(level), `let ${finalAssignment.name}: ${type};\n`);
        });
        collector.push(
          '  '.repeat(level),
          `if ${debugPrintHighIRExpression(s.booleanExpression)} {\n`
        );
        level += 1;
        s.s1.forEach(printer);
        s.finalAssignments.forEach((finalAssignment) => {
          const v1 = debugPrintHighIRExpression(finalAssignment.branch1Value);
          collector.push('  '.repeat(level), `${finalAssignment.name} = ${v1};\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `} else {\n`);
        level += 1;
        s.s2.forEach(printer);
        s.finalAssignments.forEach((finalAssignment) => {
          const v2 = debugPrintHighIRExpression(finalAssignment.branch2Value);
          collector.push('  '.repeat(level), `${finalAssignment.name} = ${v2};\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        return;
      case 'HighIRSingleIfStatement':
        collector.push(
          '  '.repeat(level),
          `if ${s.invertCondition ? '!' : ''}${debugPrintHighIRExpression(s.booleanExpression)} {\n`
        );
        level += 1;
        s.statements.forEach(printer);
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        break;
      case 'HighIRBreakStatement':
        collector.push(
          '  '.repeat(level),
          `${breakCollector} = ${debugPrintHighIRExpression(s.breakValue)};\n`
        );
        collector.push('  '.repeat(level), 'break;\n');
        break;
      case 'HighIRWhileStatement': {
        s.loopVariables.forEach((v) => {
          const type = prettyPrintHighIRType(v.type);
          collector.push(
            '  '.repeat(level),
            `let ${v.name}: ${type} = ${debugPrintHighIRExpression(v.initialValue)};\n`
          );
        });
        const previousBreakCollector = breakCollector;
        breakCollector = s.breakCollector?.name;
        if (s.breakCollector != null) {
          const { name, type } = s.breakCollector;
          collector.push('  '.repeat(level), `let ${name}: ${prettyPrintHighIRType(type)};\n`);
        }
        collector.push('  '.repeat(level), `while (true) {\n`);
        level += 1;
        s.statements.forEach(printer);
        s.loopVariables.forEach((v) => {
          collector.push(
            '  '.repeat(level),
            `${v.name} = ${debugPrintHighIRExpression(v.loopValue)};\n`
          );
        });
        level -= 1;
        collector.push('  '.repeat(level), '}\n');
        breakCollector = previousBreakCollector;
        break;
      }
      case 'HighIRStructInitializationStatement': {
        const expressionString = s.expressionList.map(debugPrintHighIRExpression).join(', ');
        collector.push(
          '  '.repeat(level),
          `let ${s.structVariableName}: ${prettyPrintHighIRType(s.type)} = [${expressionString}];\n`
        );
        break;
      }
      case 'HighIRClosureInitializationStatement': {
        const closureType = prettyPrintHighIRType(s.closureType);
        const closureNameType = `${s.closureVariableName}: ${closureType}`;
        const functionType = prettyPrintHighIRType(s.functionType);
        const functionNameType = `${s.functionName}: ${functionType}`;
        const context = debugPrintHighIRExpression(s.context);
        collector.push(
          '  '.repeat(level),
          `let ${closureNameType} = Closure { fun: (${functionNameType}), context: ${context} };\n`
        );
        return;
      }
    }
  }

  printer(statement);

  return collector.join('').trimEnd();
}

export interface HighIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly typeParameters: readonly string[];
  readonly type: HighIRFunctionType;
  readonly body: readonly HighIRStatement[];
  readonly returnValue: HighIRExpression;
}

export interface HighIRSources {
  readonly globalVariables: readonly GlobalVariable[];
  readonly closureTypes: readonly HighIRClosureTypeDefinition[];
  readonly typeDefinitions: readonly HighIRTypeDefinition[];
  readonly mainFunctionNames: readonly string[];
  readonly functions: readonly HighIRFunction[];
}

export function debugPrintHighIRFunction({
  name,
  parameters,
  typeParameters,
  type: { argumentTypes, returnType },
  body: bodyStatements,
  returnValue,
}: HighIRFunction): string {
  const typedParameters = zip(parameters, argumentTypes)
    .map(([parameter, parameterType]) => `${parameter}: ${prettyPrintHighIRType(parameterType)}`)
    .join(', ');
  const typeParameterString = typeParameters.length === 0 ? '' : `<${typeParameters.join(', ')}>`;
  const header = `function ${name}${typeParameterString}(${typedParameters}): ${prettyPrintHighIRType(
    returnType
  )} {`;
  const body = [
    ...bodyStatements.map((it) => debugPrintHighIRStatement(it, 1)),
    `  return ${debugPrintHighIRExpression(returnValue)};`,
  ].join('\n');
  return `${header}\n${body}\n}\n`;
}

export function debugPrintHighIRSources({
  globalVariables,
  closureTypes,
  typeDefinitions,
  mainFunctionNames,
  functions,
}: HighIRSources): string {
  return [
    ...globalVariables.map(({ name, content }) => `const ${name} = '${content}';\n`),
    ...closureTypes.map(prettyPrintHighIRClosureTypeDefinition),
    ...typeDefinitions.map(prettyPrintHighIRTypeDefinition),
    ...functions.map((it) => debugPrintHighIRFunction(it)),
    ...(mainFunctionNames.length === 0
      ? []
      : [`sources.mains = [${mainFunctionNames.join(', ')}]`]),
  ].join('\n');
}
