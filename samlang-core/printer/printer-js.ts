import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from '../ast/common-names';
import { binaryOperatorSymbolTable } from '../ast/common-operators';
import type { HighIRStatement, HighIRExpression } from '../ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from '../ast/hir-toplevel';
import {
  PrettierDocument,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  prettyPrintAccordingToPrettierAlgorithm,
} from './printer-prettier-core';
import {
  createCommaSeparatedList,
  createParenthesisSurroundedDocument,
  createBracketSurroundedDocument,
  createBracesSurroundedBlockDocument,
} from './printer-prettier-library';

// Thanks https://gist.github.com/getify/3667624
const escapeDoubleQuotes = (string: string) => string.replace(/\\([\s\S])|(")/g, '\\$1$2');

const createPrettierDocumentFromHighIRExpression = (
  highIRExpression: HighIRExpression
): PrettierDocument => {
  switch (highIRExpression.__type__) {
    case 'HighIRIntLiteralExpression':
      return PRETTIER_TEXT(String(highIRExpression.value));
    case 'HighIRStringLiteralExpression':
      return PRETTIER_TEXT(`"${escapeDoubleQuotes(highIRExpression.value)}"`);
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
      const binaryExpressionDocument = PRETTIER_CONCAT(
        withParenthesisWhenNecesasry(e1),
        PRETTIER_TEXT(` ${operator} `),
        withParenthesisWhenNecesasry(e2)
      );
      return operator === '/'
        ? PRETTIER_CONCAT(
            PRETTIER_TEXT('Math.floor'),
            createParenthesisSurroundedDocument(binaryExpressionDocument)
          )
        : binaryExpressionDocument;
    }
  }
};

export const highIRExpressionToString = (highIRExpression: HighIRExpression): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRExpression(highIRExpression)
  ).trimEnd();

const concatStatements = (statements: readonly HighIRStatement[]) => {
  const documents = statements
    .map((it) => [createPrettierDocumentFromHighIRStatement(it), PRETTIER_LINE])
    .flat();
  if (documents.length === 0) return documents;
  return documents.slice(0, documents.length - 1);
};

const createPrettierDocumentFromHighIRStatement = (
  highIRStatement: HighIRStatement
): PrettierDocument => {
  switch (highIRStatement.__type__) {
    case 'HighIRFunctionCallStatement': {
      const segments: PrettierDocument[] = [];
      if (highIRStatement.returnCollector != null) {
        segments.push(PRETTIER_TEXT(`var ${highIRStatement.returnCollector} = `));
      }
      segments.push(
        createPrettierDocumentFromHighIRExpression(highIRStatement.functionExpression),
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(
            highIRStatement.functionArguments,
            createPrettierDocumentFromHighIRExpression
          )
        ),
        PRETTIER_TEXT(';')
      );
      return PRETTIER_CONCAT(...segments);
    }
    case 'HighIRIfElseStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('if '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromHighIRExpression(highIRStatement.booleanExpression)
        ),
        PRETTIER_TEXT(' '),
        createBracesSurroundedBlockDocument(concatStatements(highIRStatement.s1)),
        PRETTIER_TEXT(' else '),
        createBracesSurroundedBlockDocument(concatStatements(highIRStatement.s2))
      );
    case 'HighIRWhileTrueStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('while (true) '),
        createBracesSurroundedBlockDocument(concatStatements(highIRStatement.statements))
      );
    case 'HighIRLetDefinitionStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.name} = `),
        createPrettierDocumentFromHighIRExpression(highIRStatement.assignedExpression),
        PRETTIER_TEXT(';')
      );
    case 'HighIRStructInitializationStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.structVariableName} = `),
        createBracketSurroundedDocument(
          createCommaSeparatedList(
            highIRStatement.expressionList,
            createPrettierDocumentFromHighIRExpression
          )
        ),
        PRETTIER_TEXT(';')
      );
    case 'HighIRReturnStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('return '),
        createPrettierDocumentFromHighIRExpression(highIRStatement.expression),
        PRETTIER_TEXT(';')
      );
  }
};

export const highIRStatementToString = (highIRStatement: HighIRStatement): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRStatement(highIRStatement)
  ).trimEnd();

const createPrettierDocumentFromHighIRFunction = (
  highIRFunction: HighIRFunction
): PrettierDocument =>
  PRETTIER_CONCAT(
    PRETTIER_TEXT(`const ${highIRFunction.name} = `),
    createParenthesisSurroundedDocument(
      createCommaSeparatedList(highIRFunction.parameters, PRETTIER_TEXT)
    ),
    PRETTIER_TEXT(' => '),
    createBracesSurroundedBlockDocument(concatStatements(highIRFunction.body)),
    PRETTIER_TEXT(';')
  );

export const highIRFunctionToString = (highIRFunction: HighIRFunction): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRFunction(highIRFunction)
  );

const createPrettierDocumentFromHighIRModule = (
  highIRModule: HighIRModule,
  forInterpreter: boolean
): PrettierDocument => {
  const segments: PrettierDocument[] = [
    ...(forInterpreter ? [PRETTIER_TEXT("let printed = '';"), PRETTIER_LINE, PRETTIER_LINE] : []),
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;`),
    PRETTIER_LINE,
    PRETTIER_TEXT(
      forInterpreter
        ? `const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => { printed += line; printed += "\\n" };`
        : `const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => console.log(line);`
    ),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);`),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);`),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };`),
    PRETTIER_LINE,
    PRETTIER_LINE,
  ];
  highIRModule.functions.forEach((highIRFunction) =>
    segments.push(createPrettierDocumentFromHighIRFunction(highIRFunction), PRETTIER_LINE)
  );
  segments.push(
    PRETTIER_LINE,
    PRETTIER_TEXT(`${ENCODED_COMPILED_PROGRAM_MAIN}();`),
    PRETTIER_LINE,
    ...(forInterpreter ? [PRETTIER_TEXT('printed')] : [])
  );
  return PRETTIER_CONCAT(...segments);
};

export const highIRModuleToJSString = (
  highIRModule: HighIRModule,
  forInterpreter = false
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRModule(highIRModule, forInterpreter)
  ).trimEnd();
