import { Sources, ModuleReference } from '..';
import { binaryOperatorSymbolTable } from '../ast/common/binary-operators';
import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  encodeMainFunctionName,
} from '../ast/common/name-encoder';
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
      return `return ${highIRExpressionToString(highIRStatement.expression)};`;
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
      const addParentheses = (subExpression: HighIRExpression): string => {
        if (subExpression.__type__ === 'HighIRBinaryExpression') {
          return `(${highIRExpressionToString(subExpression)})`;
        }
        return highIRExpressionToString(subExpression);
      };
      return `${addParentheses(expression)}[${index}]`;
    }
    case 'HighIRVariableExpression':
      return (highIRExpression as HighIRVariableExpression).name;
    case 'HighIRNameExpression':
      return (highIRExpression as HighIRNameExpression).name;
    case 'HighIRBinaryExpression': {
      const { e1, e2, operator } = highIRExpression;
      const addParentheses = (subExpression: HighIRExpression): string => {
        if (subExpression.__type__ === 'HighIRBinaryExpression') {
          const p1 = binaryOperatorSymbolTable[operator]?.precedence;
          const p2 = binaryOperatorSymbolTable[subExpression.operator]?.precedence;
          if (p1 != null && p2 != null && p2 >= p1) {
            return `(${highIRExpressionToString(subExpression)})`;
          }
        }
        return highIRExpressionToString(subExpression);
      };
      return `${addParentheses(e1)} ${operator} ${addParentheses(e2)}`;
    }
  }
};

export const highIRSourcesToJSString = (
  sources: Sources<HighIRModule>,
  entryModule?: ModuleReference
): string => {
  let finalStr = `let printed = '';
  const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
  const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => {
    printed += \`\${line}\n\`;
  };
  const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
  const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);\n`;

  sources.forEach((module) => {
    finalStr += `${module.functions.map((f) => highIRFunctionToString(f)).join(';\n')}`;
  });
  if (entryModule) {
    finalStr += `\n${encodeMainFunctionName(entryModule)}();`;
  }
  return `${finalStr}\nprinted`;
};
