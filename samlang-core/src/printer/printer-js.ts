import { Sources, ModuleReference } from '..';
import { binaryOperatorSymbolTable } from '../ast/common/binary-operators';
import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  encodeMainFunctionName,
  ENCODED_FUNCTION_NAME_THROW,
} from '../ast/common/name-encoder';
import { HighIRStatement, HighIRExpression } from '../ast/hir/hir-expressions';
import { HighIRFunction, HighIRModule } from '../ast/hir/hir-toplevel';
import {
  PrettierDocument,
  PRETTIER_NIL,
  PRETTIER_CONCAT,
  PRETTIER_NEST,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  PRETTIER_GROUP,
  PRETTIER_NO_SPACE_BRACKET,
  PRETTIER_SPACED_BRACKET,
  prettyPrintAccordingToPrettierAlgorithm,
} from './printer-prettier-core';
import { createParenthesisSurroundedDocument } from './printer-prettier-library';

const createPrettierDocumentFromHighIRExpression = (
  highIRExpression: HighIRExpression
): PrettierDocument => {
  switch (highIRExpression.__type__) {
    case 'HighIRIntLiteralExpression':
      return PRETTIER_TEXT(String(highIRExpression.value));
    case 'HighIRStringLiteralExpression':
      return PRETTIER_TEXT(`'${highIRExpression.value}'`);
    case 'HighIRVariableExpression':
    case 'HighIRNameExpression':
      return PRETTIER_TEXT(highIRExpression.name);
    case 'HighIRIndexAccessExpression': {
      const { expression: subExpression, index } = highIRExpression;
      let subExpressionDocument = createPrettierDocumentFromHighIRExpression(subExpression);
      if (subExpression.__type__ === 'HighIRBinaryExpression') {
        subExpressionDocument = createParenthesisSurroundedDocument(subExpressionDocument);
      }
      return PRETTIER_CONCAT(subExpressionDocument, PRETTIER_TEXT(`[${index}]`));
    }
    case 'HighIRBinaryExpression': {
      const { e1, e2, operator } = highIRExpression;
      const withParenthesisWhenNecesasry = (subExpression: HighIRExpression): PrettierDocument => {
        const subExpressionDocument = createPrettierDocumentFromHighIRExpression(subExpression);
        if (subExpression.__type__ === 'HighIRBinaryExpression') {
          const p1 = binaryOperatorSymbolTable[operator]?.precedence;
          const p2 = binaryOperatorSymbolTable[subExpression.operator]?.precedence;
          if (p1 != null && p2 != null && p2 >= p1) {
            return createParenthesisSurroundedDocument(subExpressionDocument);
          }
        }
        return subExpressionDocument;
      };
      return PRETTIER_CONCAT(
        withParenthesisWhenNecesasry(e1),
        PRETTIER_TEXT(` ${operator} `),
        withParenthesisWhenNecesasry(e2)
      );
    }
  }
};

export const highIRExpressionToString = (highIRExpression: HighIRExpression): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 80,
    createPrettierDocumentFromHighIRExpression(highIRExpression)
  ).trimEnd();

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
      return `var ${structVariableName} = [${expressionList
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
  const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
  const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); }\n`;

  sources.forEach((module) => {
    finalStr += `${module.functions.map((f) => highIRFunctionToString(f)).join(';\n')}`;
  });
  if (entryModule) {
    finalStr += `\n${encodeMainFunctionName(entryModule)}();`;
  }
  return `${finalStr}\nprinted`;
};
