import type { IROperator } from './common-operators';
import { HighIRType, HIR_BOOL_TYPE, HIR_INT_TYPE, prettyPrintHighIRType } from './hir-types';

import { checkNotNull, Long } from 'samlang-core-utils';

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

export interface HighIRSwitchStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRSwitchStatement';
  readonly caseVariable: string;
  readonly cases: readonly {
    readonly caseNumber: number;
    readonly statements: readonly HighIRStatement[];
  }[];
  readonly finalAssignments: readonly {
    readonly name: string;
    readonly type: HighIRType;
    readonly branchValues: readonly HighIRExpression[];
  }[];
}

export interface AssignmentForHighIRWhileStatement {
  readonly name: string;
  readonly type: HighIRType;
  readonly value: HighIRExpression;
}

export interface HighIRWhileStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRWhileStatement';
  readonly loopVariables: readonly {
    readonly name: string;
    readonly type: HighIRType;
    readonly initialValue: HighIRExpression;
    readonly loopValue: HighIRExpression;
  }[];
  readonly statements: readonly HighIRStatement[];
  readonly conditionValue: HighIRExpression;
  readonly returnAssignment?: {
    readonly name: string;
    readonly type: HighIRType;
    readonly value: HighIRExpression;
  };
}

export interface HighIRVariantPatternToStatement {
  readonly tagOrder: number;
  readonly statements: readonly HighIRStatement[];
}

export interface HighIRCastStatement extends BaseHighIRStatement {
  readonly __type__: 'HighIRCastStatement';
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
  | HighIRWhileStatement
  | HighIRCastStatement
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
    // istanbul ignore next
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

export const HIR_SWITCH = ({
  caseVariable,
  cases,
  finalAssignments,
}: ConstructorArgumentObject<HighIRSwitchStatement>): HighIRSwitchStatement => ({
  __type__: 'HighIRSwitchStatement',
  caseVariable,
  cases,
  finalAssignments,
});

export const HIR_WHILE = ({
  loopVariables,
  statements,
  conditionValue,
  returnAssignment,
}: ConstructorArgumentObject<HighIRWhileStatement>): HighIRWhileStatement => ({
  __type__: 'HighIRWhileStatement',
  loopVariables,
  statements,
  conditionValue,
  returnAssignment,
});

export const HIR_CAST = ({
  name,
  type,
  assignedExpression,
}: ConstructorArgumentObject<HighIRCastStatement>): HighIRCastStatement => ({
  __type__: 'HighIRCastStatement',
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
            ? `let ${s.returnCollector}: ${prettyPrintHighIRType(s.returnType)} = `
            : '';
        collector.push(
          '  '.repeat(level),
          `${collectorString}${functionString}(${argumentString});\n`
        );
        break;
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
        break;
      case 'HighIRSwitchStatement': {
        s.finalAssignments.forEach((finalAssignment) => {
          const type = prettyPrintHighIRType(finalAssignment.type);
          collector.push('  '.repeat(level), `let ${finalAssignment.name}: ${type};\n`);
        });
        collector.push('  '.repeat(level), `switch (${s.caseVariable}) {\n`);
        level += 1;
        s.cases.forEach(({ caseNumber, statements }, i) => {
          collector.push('  '.repeat(level), `case ${caseNumber}: {\n`);
          level += 1;
          statements.forEach(printer);
          s.finalAssignments.forEach((finalAssignment) => {
            const value = debugPrintHighIRExpression(checkNotNull(finalAssignment.branchValues[i]));
            collector.push('  '.repeat(level), `${finalAssignment.name} = ${value};\n`);
          });
          level -= 1;
          collector.push('  '.repeat(level), `}\n`);
        });
        level -= 1;
        collector.push('  '.repeat(level), `}\n`);
        break;
      }
      case 'HighIRWhileStatement': {
        s.loopVariables.forEach((v) => {
          const type = prettyPrintHighIRType(v.type);
          collector.push(
            '  '.repeat(level),
            `let ${v.name}: ${type} = ${debugPrintHighIRExpression(v.initialValue)};\n`
          );
        });
        if (s.returnAssignment != null) {
          const { name, type } = s.returnAssignment;
          collector.push('  '.repeat(level), `let ${name}: ${prettyPrintHighIRType(type)};\n`);
        }
        collector.push('  '.repeat(level), `do {\n`);
        level += 1;
        s.statements.forEach(printer);
        s.loopVariables.forEach((v) => {
          collector.push(
            '  '.repeat(level),
            `${v.name} = ${debugPrintHighIRExpression(v.loopValue)};\n`
          );
        });
        if (s.returnAssignment != null) {
          const value = debugPrintHighIRExpression(s.returnAssignment.value);
          collector.push('  '.repeat(level), `${s.returnAssignment.name} = ${value};\n`);
        }
        level -= 1;
        collector.push(
          '  '.repeat(level),
          `} while (${debugPrintHighIRExpression(s.conditionValue)});\n`
        );
        break;
      }
      case 'HighIRCastStatement':
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
