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
  readonly functionExpression: HighIRExpression;
  readonly functionArguments: readonly HighIRExpression[];
  readonly returnCollector?: { readonly name: string; readonly type: HighIRType };
}

export interface HighIRIfElseStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRIfElseStatement';
  readonly multiAssignedVariable?: {
    readonly name: string;
    readonly type: HighIRType;
    readonly branch1Variable: string;
    readonly branch2Variable: string;
  };
  readonly booleanExpression: HighIRExpression;
  readonly s1: readonly HighIRStatement[];
  readonly s2: readonly HighIRStatement[];
}

export interface HighIRSwitchStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRSwitchStatement';
  readonly multiAssignedVariable?: {
    readonly name: string;
    readonly type: HighIRType;
    readonly branchVariables: readonly string[];
  };
  readonly caseVariable: string;
  readonly cases: readonly {
    readonly caseNumber: number;
    readonly statements: readonly HighIRStatement[];
  }[];
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
  | HighIRBinaryStatement
  | HighIRIndexAccessStatement
  | HighIRFunctionCallStatement
  | HighIRIfElseStatement
  | HighIRSwitchStatement
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

export const HIR_BINARY = ({
  name,
  operator,
  e1,
  e2,
}: Omit<ConstructorArgumentObject<HighIRBinaryStatement>, 'type'>): HighIRBinaryStatement => {
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
};

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

export const HIR_SWITCH = ({
  multiAssignedVariable,
  caseVariable,
  cases,
}: ConstructorArgumentObject<HighIRSwitchStatement>): HighIRSwitchStatement => ({
  __type__: 'HighIRSwitchStatement',
  multiAssignedVariable,
  caseVariable,
  cases,
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
  }
};

export const debugPrintHighIRStatement = (statement: HighIRStatement, startLevel = 0): string => {
  const collector: string[] = [];
  let level = startLevel;

  const printer = (s: HighIRStatement) => {
    switch (s.__type__) {
      case 'HighIRIndexAccessStatement': {
        const type = prettyPrintHighIRType(s.type);
        const pointerExpression = debugPrintHighIRExpression(s.pointerExpression);
        collector.push(
          '  '.repeat(level),
          `let ${s.name}: ${type} = ${pointerExpression}[${s.index}];\n`
        );
        break;
      }
      case 'HighIRBinaryStatement': {
        const type = prettyPrintHighIRType(s.type);
        const e1 = debugPrintHighIRExpression(s.e1);
        const e2 = debugPrintHighIRExpression(s.e2);
        collector.push('  '.repeat(level), `let ${s.name}: ${type} = ${e1} ${s.operator} ${e2};\n`);
        break;
      }
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
          const type = prettyPrintHighIRType(s.multiAssignedVariable.type);
          const { name, branch1Variable, branch2Variable } = s.multiAssignedVariable;
          collector.push(
            '  '.repeat(level),
            `// ${name}: ${type} = phi(${branch1Variable}, ${branch2Variable})\n`
          );
        }
        break;
      case 'HighIRSwitchStatement': {
        collector.push('  '.repeat(level), `switch (${s.caseVariable})} {\n`);
        level += 1;
        s.cases.forEach(({ caseNumber, statements }) => {
          collector.push('  '.repeat(level), `case ${caseNumber}: {\n`);
          level += 1;
          statements.forEach(printer);
          level -= 1;
          collector.push('  '.repeat(level), `}\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        if (s.multiAssignedVariable != null) {
          const type = prettyPrintHighIRType(s.multiAssignedVariable.type);
          const { name, branchVariables } = s.multiAssignedVariable;
          collector.push(
            '  '.repeat(level),
            `// ${name}: ${type} = phi(${branchVariables.join(', ')})\n`
          );
        }
        break;
      }
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
