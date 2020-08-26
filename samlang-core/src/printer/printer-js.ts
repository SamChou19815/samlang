import { Sources, ModuleReference } from '..';
import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  encodeMainFunctionName,
  ENCODED_FUNCTION_NAME_THROW,
} from '../ast/common-names';
import { binaryOperatorSymbolTable } from '../ast/common-operators';
import { HighIRStatement, HighIRExpression } from '../ast/hir-expressions';
import { HighIRFunction, HighIRModule } from '../ast/hir-toplevel';
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
    case 'HighIRFunctionCallStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.returnCollector} = `),
        createPrettierDocumentFromHighIRExpression(highIRStatement.functionExpression),
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(
            highIRStatement.functionArguments,
            createPrettierDocumentFromHighIRExpression
          )
        ),
        PRETTIER_TEXT(';')
      );
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

const createPrettierDocumentFromHighIRSources = (
  sources: Sources<HighIRModule>,
  entryModule: ModuleReference | undefined
): PrettierDocument => {
  const segments: PrettierDocument[] = [
    PRETTIER_TEXT("let printed = '';"),
    PRETTIER_LINE,
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;`),
    PRETTIER_LINE,
    PRETTIER_TEXT(
      `const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => { printed += line; printed += "\\n" };`
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
  sources.forEach((samlangModule) =>
    samlangModule.functions.forEach((highIRFunction) =>
      segments.push(createPrettierDocumentFromHighIRFunction(highIRFunction), PRETTIER_LINE)
    )
  );
  if (entryModule != null) {
    segments.push(
      PRETTIER_LINE,
      PRETTIER_TEXT(`${encodeMainFunctionName(entryModule)}();`),
      PRETTIER_LINE,
      PRETTIER_TEXT('printed')
    );
  } else {
    segments.push(PRETTIER_LINE, PRETTIER_TEXT('printed'));
  }
  return PRETTIER_CONCAT(...segments);
};

export const highIRSourcesToJSString = (
  sources: Sources<HighIRModule>,
  entryModule?: ModuleReference
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRSources(sources, entryModule)
  ).trimEnd();
