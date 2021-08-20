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

export const prettyPrintMidIRType = (type: MidIRType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'IdentifierType':
      return type.name;
    case 'FunctionType':
      return `(${type.argumentTypes
        .map(prettyPrintMidIRType)
        .join(', ')}) -> ${prettyPrintMidIRType(type.returnType)}`;
  }
};

const standardizeMidIRTypeForComparison = (t: MidIRType): MidIRType =>
  t.__type__ === 'PrimitiveType' && t.type === 'string' ? MIR_ANY_TYPE : t;

export const isTheSameMidIRType = (type1: MidIRType, type2: MidIRType): boolean => {
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
};

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

export type MidIRStatement =
  | MidIRBinaryStatement
  | MidIRIndexAccessStatement
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

export const MIR_BINARY = ({
  name,
  operator,
  e1,
  e2,
}: Omit<ConstructorArgumentObject<MidIRBinaryStatement>, 'type'>): MidIRBinaryStatement => {
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
};

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

export const debugPrintMidIRExpression = (expression: MidIRExpression): string => {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
      return expression.value.toString();
    case 'MidIRVariableExpression':
      return `(${expression.name}: ${prettyPrintMidIRType(expression.type)})`;
    case 'MidIRNameExpression':
      return expression.name;
  }
};

export const prettyPrintMidIRExpressionAsJSExpression = (expression: MidIRExpression): string => {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
      return expression.value.toString();
    case 'MidIRVariableExpression':
    case 'MidIRNameExpression':
      return expression.name;
  }
};

export const debugPrintMidIRStatement = (statement: MidIRStatement, startLevel = 0): string => {
  const collector: string[] = [];
  let level = startLevel;
  let breakCollector: string | undefined = undefined;

  const printer = (s: MidIRStatement) => {
    switch (s.__type__) {
      case 'MidIRIndexAccessStatement': {
        const type = prettyPrintMidIRType(s.type);
        const pointerExpression = debugPrintMidIRExpression(s.pointerExpression);
        collector.push(
          '  '.repeat(level),
          `let ${s.name}: ${type} = ${pointerExpression}[${s.index}];\n`
        );
        break;
      }
      case 'MidIRBinaryStatement': {
        const type = prettyPrintMidIRType(s.type);
        const e1 = debugPrintMidIRExpression(s.e1);
        const e2 = debugPrintMidIRExpression(s.e2);
        collector.push('  '.repeat(level), `let ${s.name}: ${type} = ${e1} ${s.operator} ${e2};\n`);
        break;
      }
      case 'MidIRFunctionCallStatement': {
        const functionString = debugPrintMidIRExpression(s.functionExpression);
        const argumentString = s.functionArguments.map(debugPrintMidIRExpression).join(', ');
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
          `if ${debugPrintMidIRExpression(s.booleanExpression)} {\n`
        );
        level += 1;
        s.s1.forEach(printer);
        s.finalAssignments.forEach((finalAssignment) => {
          const v1 = debugPrintMidIRExpression(finalAssignment.branch1Value);
          collector.push('  '.repeat(level), `${finalAssignment.name} = ${v1};\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `} else {\n`);
        level += 1;
        s.s2.forEach(printer);
        s.finalAssignments.forEach((finalAssignment) => {
          const v2 = debugPrintMidIRExpression(finalAssignment.branch2Value);
          collector.push('  '.repeat(level), `${finalAssignment.name} = ${v2};\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        break;
      case 'MidIRSingleIfStatement':
        collector.push(
          '  '.repeat(level),
          `if ${s.invertCondition ? '!' : ''}${debugPrintMidIRExpression(s.booleanExpression)} {\n`
        );
        level += 1;
        s.statements.forEach(printer);
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        break;
      case 'MidIRBreakStatement':
        collector.push(
          '  '.repeat(level),
          `${breakCollector} = ${debugPrintMidIRExpression(s.breakValue)};\n`
        );
        collector.push('  '.repeat(level), 'break;\n');
        break;
      case 'MidIRWhileStatement': {
        s.loopVariables.forEach((v) => {
          const type = prettyPrintMidIRType(v.type);
          collector.push(
            '  '.repeat(level),
            `let ${v.name}: ${type} = ${debugPrintMidIRExpression(v.initialValue)};\n`
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
            `${v.name} = ${debugPrintMidIRExpression(v.loopValue)};\n`
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
          `let ${s.name}: ${prettyPrintMidIRType(s.type)} = ${debugPrintMidIRExpression(
            s.assignedExpression
          )};\n`
        );
        break;
      case 'MidIRStructInitializationStatement': {
        const expressionString = s.expressionList.map(debugPrintMidIRExpression).join(', ');
        collector.push(
          '  '.repeat(level),
          `let ${s.structVariableName}: ${prettyPrintMidIRType(s.type)} = [${expressionString}];\n`
        );
        break;
      }
    }
  };

  printer(statement);

  return collector.join('').trimEnd();
};

export const prettyPrintMidIRStatementAsJSStatement = (
  statement: MidIRStatement,
  startLevel = 0
): string => {
  const collector: string[] = [];
  let level = startLevel;
  let breakCollector: string | undefined = undefined;

  const printer = (s: MidIRStatement) => {
    switch (s.__type__) {
      case 'MidIRIndexAccessStatement': {
        const pointerString = prettyPrintMidIRExpressionAsJSExpression(s.pointerExpression);
        collector.push('  '.repeat(level), `let ${s.name} = ${pointerString}[${s.index}];\n`);
        break;
      }
      case 'MidIRBinaryStatement': {
        const e1 = prettyPrintMidIRExpressionAsJSExpression(s.e1);
        const e2 = prettyPrintMidIRExpressionAsJSExpression(s.e2);
        const binaryExpressionString = `${e1} ${s.operator} ${e2}`;
        const wrapped =
          s.operator === '/' ? `Math.floor(${binaryExpressionString})` : binaryExpressionString;
        collector.push('  '.repeat(level), `let ${s.name} = ${wrapped};\n`);
        break;
      }
      case 'MidIRFunctionCallStatement': {
        const functionExpression = prettyPrintMidIRExpressionAsJSExpression(s.functionExpression);
        const functionArguments = s.functionArguments
          .map(prettyPrintMidIRExpressionAsJSExpression)
          .join(', ');
        const functionCallString = `${functionExpression}(${functionArguments});`;
        collector.push(
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
          collector.push('  '.repeat(level), `let ${final.name};\n`);
        });
        collector.push(
          '  '.repeat(level),
          `if (${prettyPrintMidIRExpressionAsJSExpression(s.booleanExpression)}) {\n`
        );
        level += 1;
        s.s1.forEach(printer);
        s.finalAssignments.forEach((finalAssignment) => {
          const v1 = prettyPrintMidIRExpressionAsJSExpression(finalAssignment.branch1Value);
          collector.push('  '.repeat(level), `${finalAssignment.name} = ${v1};\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `} else {\n`);
        level += 1;
        s.s2.forEach(printer);
        s.finalAssignments.forEach((finalAssignment) => {
          const v2 = prettyPrintMidIRExpressionAsJSExpression(finalAssignment.branch2Value);
          collector.push('  '.repeat(level), `${finalAssignment.name} = ${v2};\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), '}\n');
        break;
      case 'MidIRSingleIfStatement':
        collector.push(
          '  '.repeat(level),
          `if (${s.invertCondition ? '!' : ''}${prettyPrintMidIRExpressionAsJSExpression(
            s.booleanExpression
          )}) {\n`
        );
        level += 1;
        s.statements.forEach(printer);
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        break;
      case 'MidIRBreakStatement':
        if (breakCollector != null) {
          collector.push(
            '  '.repeat(level),
            `${breakCollector} = ${prettyPrintMidIRExpressionAsJSExpression(s.breakValue)};\n`
          );
        }
        collector.push('  '.repeat(level), 'break;\n');
        break;
      case 'MidIRWhileStatement': {
        s.loopVariables.forEach((v) => {
          collector.push(
            '  '.repeat(level),
            `let ${v.name} = ${prettyPrintMidIRExpressionAsJSExpression(v.initialValue)};\n`
          );
        });
        const previousBreakCollector = breakCollector;
        breakCollector = s.breakCollector?.name;
        if (s.breakCollector != null) {
          collector.push('  '.repeat(level), `let ${s.breakCollector.name};\n`);
        }
        collector.push('  '.repeat(level), `while (true) {\n`);
        level += 1;
        s.statements.forEach(printer);
        s.loopVariables.forEach((v) => {
          collector.push(
            '  '.repeat(level),
            `${v.name} = ${prettyPrintMidIRExpressionAsJSExpression(v.loopValue)};\n`
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
          `let ${s.name} = ${prettyPrintMidIRExpressionAsJSExpression(s.assignedExpression)};\n`
        );
        break;
      case 'MidIRStructInitializationStatement': {
        const expressions = s.expressionList
          .map(prettyPrintMidIRExpressionAsJSExpression)
          .join(', ');
        collector.push('  '.repeat(level), `let ${s.structVariableName} = [${expressions}];`);
        break;
      }
    }
  };

  printer(statement);

  return collector.join('').trimEnd();
};

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

export const debugPrintMidIRFunction = ({
  name,
  parameters,
  type: { argumentTypes, returnType },
  body: bodyStatements,
  returnValue,
}: MidIRFunction): string => {
  const typedParameters = zip(parameters, argumentTypes)
    .map(([parameter, parameterType]) => `${parameter}: ${prettyPrintMidIRType(parameterType)}`)
    .join(', ');
  const header = `function ${name}(${typedParameters}): ${prettyPrintMidIRType(returnType)} {`;
  const body = [
    ...bodyStatements.map((it) => debugPrintMidIRStatement(it, 1)),
    `  return ${debugPrintMidIRExpression(returnValue)};`,
  ].join('\n');
  return `${header}\n${body}\n}\n`;
};

export const debugPrintMidIRSources = ({
  globalVariables,
  typeDefinitions,
  functions,
}: MidIRSources): string =>
  [
    ...globalVariables.map(({ name, content }) => `const ${name} = '${content}';\n`),
    ...typeDefinitions.map(
      ({ identifier, mappings }) =>
        `type ${identifier} = (${mappings.map(prettyPrintMidIRType).join(', ')});\n`
    ),
    ...functions.map((it) => debugPrintMidIRFunction(it)),
  ].join('\n');

// Thanks https://gist.github.com/getify/3667624
const escapeDoubleQuotes = (string: string) => string.replace(/\\([\s\S])|(")/g, '\\$1$2');

export const prettyPrintMidIRSourcesAsJSSources = (sources: MidIRSources): string =>
  [
    ...sources.globalVariables.map(
      ({ name, content }) => `const ${name} = "${escapeDoubleQuotes(content)}";\n`
    ),
    ...sources.functions.map(({ name, parameters, body, returnValue }) => {
      const header = `function ${name}(${parameters.join(', ')}) {`;
      const bodyString = [
        ...body.map((it) => prettyPrintMidIRStatementAsJSStatement(it, 1)),
        `  return ${prettyPrintMidIRExpressionAsJSExpression(returnValue)};`,
      ].join('\n');
      return `${header}\n${bodyString}\n}\n`;
    }),
  ].join('');
