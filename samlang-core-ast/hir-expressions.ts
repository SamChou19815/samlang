import type { IROperator } from './common-operators';
import { HighIRType, HIR_BOOL_TYPE, HIR_INT_TYPE, prettyPrintHighIRType } from './hir-types';

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
  readonly returnCollector?: { readonly name: string; readonly type: HighIRType };
}

export interface HighIRIfElseStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIfElseStatement';
  readonly multiAssignedVariable?: string;
  readonly booleanExpression: HighIRExpression;
  readonly s1: readonly HighIRStatement[];
  readonly s2: readonly HighIRStatement[];
}

export interface HighIRWhileTrueStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRWhileTrueStatement';
  readonly multiAssignedVariables: readonly string[];
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

export const HIR_FALSE: HighIRIntLiteralExpression = {
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_BOOL_TYPE,
  value: Long.ZERO,
};

export const HIR_TRUE: HighIRIntLiteralExpression = {
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_BOOL_TYPE,
  value: Long.ONE,
};

export const HIR_INT = (value: number | Long): HighIRIntLiteralExpression => ({
  __type__: 'HighIRIntLiteralExpression',
  type: HIR_INT_TYPE,
  value: typeof value === 'number' ? Long.fromInt(value) : value,
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
}: Omit<ConstructorArgumentObject<HighIRBinaryExpression>, 'type'>): HighIRBinaryExpression => {
  let type: HighIRType;
  switch (operator) {
    case '*':
    case '/':
    case '%':
    case '+':
    case '-':
      type = HIR_INT_TYPE;
      break;
    case '^':
    case '<':
    case '>':
    case '<=':
    case '>=':
    case '==':
    case '!=':
      type = HIR_BOOL_TYPE;
      break;
  }
  if (operator === '-' && e2.__type__ === 'HighIRIntLiteralExpression') {
    const negOfE2Constant = e2.value.neg();
    if (negOfE2Constant.notEquals(e2.value)) {
      return {
        __type__: 'HighIRBinaryExpression',
        type,
        operator: '+',
        e1,
        e2: HIR_INT(negOfE2Constant),
      };
    }
  }
  return { __type__: 'HighIRBinaryExpression', type, operator, e1, e2 };
};

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
  multiAssignedVariable,
  booleanExpression,
  s1,
  s2,
}: ConstructorArgumentObject<HighIRIfElseStatement>): HighIRIfElseStatement => ({
  __type__: 'HighIRIfElseStatement',
  multiAssignedVariable,
  booleanExpression,
  s1,
  s2,
});

export const HIR_WHILE_TRUE = (
  multiAssignedVariables: readonly string[],
  statements: readonly HighIRStatement[]
): HighIRWhileTrueStatement => ({
  __type__: 'HighIRWhileTrueStatement',
  multiAssignedVariables,
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

export const debugPrintHighIRExpression = (expression: HighIRExpression): string => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
      return expression.value.toString();
    case 'HighIRVariableExpression':
      return `(${expression.name}: ${prettyPrintHighIRType(expression.type)})`;
    case 'HighIRNameExpression':
      return expression.name;
    case 'HighIRIndexAccessExpression':
      return `(${debugPrintHighIRExpression(expression.expression)}[${
        expression.index
      }]: ${prettyPrintHighIRType(expression.type)})`;
    case 'HighIRBinaryExpression':
      return `(${debugPrintHighIRExpression(expression.e1)} ${
        expression.operator
      } ${debugPrintHighIRExpression(expression.e2)})`;
  }
};

export const debugPrintHighIRExpressionUntyped = (expression: HighIRExpression): string => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
      return expression.value.toString();
    case 'HighIRVariableExpression':
      return expression.name;
    case 'HighIRNameExpression':
      return expression.name;
    case 'HighIRIndexAccessExpression':
      return `${debugPrintHighIRExpressionUntyped(expression.expression)}[${expression.index}]`;
    case 'HighIRBinaryExpression':
      return `(${debugPrintHighIRExpressionUntyped(expression.e1)} ${
        expression.operator
      } ${debugPrintHighIRExpressionUntyped(expression.e2)})`;
  }
};

export const debugPrintHighIRStatement = (statement: HighIRStatement, startLevel = 0): string => {
  const collector: string[] = [];
  let level = startLevel;

  const printer = (s: HighIRStatement) => {
    switch (s.__type__) {
      case 'HighIRFunctionCallStatement': {
        const functionString = debugPrintHighIRExpression(s.functionExpression);
        const argumentString = s.functionArguments.map(debugPrintHighIRExpression).join(', ');
        const collectorString =
          s.returnCollector != null
            ? `let ${s.returnCollector.name}: ${prettyPrintHighIRType(s.returnCollector.type)} = `
            : '';
        collector.push(
          '  '.repeat(level),
          `${collectorString}${functionString}(${argumentString});\n`
        );
        break;
      }
      case 'HighIRIfElseStatement':
        collector.push(
          '  '.repeat(level),
          `if ${debugPrintHighIRExpression(s.booleanExpression)} {\n`
        );
        level += 1;
        s.s1.forEach(printer);
        level -= 1;
        collector.push('  '.repeat(level), `} else {\n`);
        level += 1;
        s.s2.forEach(printer);
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        if (s.multiAssignedVariable != null) {
          collector.push('  '.repeat(level), `// phi(${s.multiAssignedVariable})\n`);
        }
        break;
      case 'HighIRWhileTrueStatement':
        s.multiAssignedVariables.forEach((name) => {
          collector.push(
            '  '.repeat(level),
            `// _param_${name} = phi([${name}, start], [_param_${name}_loop, loop])\n`
          );
        });
        collector.push('  '.repeat(level), `while true {\n`);
        level += 1;
        s.statements.forEach(printer);
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        break;
      case 'HighIRLetDefinitionStatement':
        collector.push(
          '  '.repeat(level),
          `let ${s.name}: ${prettyPrintHighIRType(s.type)} = ${debugPrintHighIRExpression(
            s.assignedExpression
          )};\n`
        );
        break;
      case 'HighIRStructInitializationStatement': {
        const expressionString = s.expressionList.map(debugPrintHighIRExpression).join(', ');
        collector.push(
          '  '.repeat(level),
          `let ${s.structVariableName}: ${prettyPrintHighIRType(s.type)} = [${expressionString}];\n`
        );
        break;
      }
      case 'HighIRReturnStatement': {
        collector.push('  '.repeat(level), `return ${debugPrintHighIRExpression(s.expression)};\n`);
        break;
      }
    }
  };

  printer(statement);

  return collector.join('').trimEnd();
};
