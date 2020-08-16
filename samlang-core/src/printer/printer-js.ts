import { Sources } from '..';
import {
  HighIRStatement,
  HighIRExpression,
  HighIRVariableExpression,
  HighIRNameExpression,
} from '../ast/hir/hir-expressions';
import { HighIRFunction, HighIRModule } from '../ast/hir/hir-toplevel';

export const highIRStatementToString = (highIRStatement: HighIRStatement): string => {
  switch (highIRStatement.__type__) {
    case 'HighIRIfElseStatement': {
      const { booleanExpression, s1, s2 } = highIRStatement;
      const booleanExpressionStr = highIRExpressionToString(booleanExpression);
      const s1Str = s1.map((s) => highIRStatementToString(s)).join(';');
      const s2Str = s2.map((s) => highIRStatementToString(s)).join(';');
      return `if (${booleanExpressionStr}) {${s1Str}} else {${s2Str}}`;
    }
    case 'HighIRWhileTrueStatement': {
      return `while (true) { ${highIRStatement.statements.map(highIRStatementToString).join('')} }`;
    }
    case 'HighIRFunctionCallStatement': {
      const { functionArguments, functionExpression, returnCollector } = highIRStatement;
      return `var ${returnCollector} = ${highIRExpressionToString(
        functionExpression
      )}(${functionArguments.map((arg) => highIRExpressionToString(arg)).join(', ')});`;
    }
    case 'HighIRLetDefinitionStatement': {
      const { name, assignedExpression } = highIRStatement;
      return `var ${name} = ${highIRExpressionToString(assignedExpression)};`;
    }
    case 'HighIRReturnStatement':
      return `return${
        highIRStatement.expression
          ? ` ${highIRExpressionToString(highIRStatement.expression)};`
          : ';'
      }`;
    case 'HighIRStructInitializationStatement': {
      const { structVariableName, expressionList } = highIRStatement;
      return `${structVariableName} = [${expressionList
        .map((e) => highIRExpressionToString(e))
        .join(', ')}];`;
    }
  }
};

export const highIRFunctionToString = (highIRFunction: HighIRFunction): string => {
  const { name, parameters, body, hasReturn } = highIRFunction;
  const bodyStr = body.map((statement) => highIRStatementToString(statement)).join(';');
  const hasReturnStr = hasReturn ? 'return;' : '';
  return `const ${name} = (${parameters.join(', ')}) => {${bodyStr} ${hasReturnStr}};`;
};

export const highIRExpressionToString = (highIRExpression: HighIRExpression): string => {
  switch (highIRExpression.__type__) {
    case 'HighIRIntLiteralExpression':
      return `${highIRExpression.value}`;
    case 'HighIRStringLiteralExpression':
      return `'${highIRExpression.value}'`;
    case 'HighIRIndexAccessExpression': {
      const { expression, index } = highIRExpression;
      return `${highIRExpressionToString(expression)}[${index}]`;
    }
    case 'HighIRVariableExpression':
      return (highIRExpression as HighIRVariableExpression).name;
    case 'HighIRNameExpression':
      return (highIRExpression as HighIRNameExpression).name;
    case 'HighIRBinaryExpression': {
      const { e1, e2, operator } = highIRExpression;
      return `(${highIRExpressionToString(e1)} ${operator} ${highIRExpressionToString(e2)})`;
    }
  }
};

export const highIRSourcesToJSString = (sources: Sources<HighIRModule>): string => {
  let finalStr = '';
  sources.forEach((module) => {
    finalStr += `${module.functions.map((f) => highIRFunctionToString(f)).join(';\n')}`;
  });
  return finalStr;
};
