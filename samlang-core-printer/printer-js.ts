import {
  PrettierDocument,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_LINE,
} from './printer-prettier-core';
import {
  createCommaSeparatedList,
  createParenthesisSurroundedDocument,
  createBracketSurroundedDocument,
  createBracesSurroundedBlockDocument,
} from './printer-prettier-library';

import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from 'samlang-core-ast/common-names';
import { binaryOperatorSymbolTable } from 'samlang-core-ast/common-operators';
import type { HighIRStatement, HighIRExpression } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';

// Thanks https://gist.github.com/getify/3667624
const escapeDoubleQuotes = (string: string) => string.replace(/\\([\s\S])|(")/g, '\\$1$2');

export const createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING = (
  highIRExpression: HighIRExpression
): PrettierDocument => {
  switch (highIRExpression.__type__) {
    case 'HighIRIntLiteralExpression':
      return PRETTIER_TEXT(String(highIRExpression.value));
    case 'HighIRVariableExpression':
    case 'HighIRNameExpression':
      return PRETTIER_TEXT(highIRExpression.name);
    case 'HighIRIndexAccessExpression': {
      const { expression: subExpression, index } = highIRExpression;
      let subExpressionDocument = createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
        subExpression
      );
      if (subExpression.__type__ === 'HighIRBinaryExpression') {
        subExpressionDocument = createParenthesisSurroundedDocument(subExpressionDocument);
      }
      return PRETTIER_CONCAT(subExpressionDocument, PRETTIER_TEXT(`[${index}]`));
    }
    case 'HighIRBinaryExpression': {
      const { e1, e2, operator } = highIRExpression;
      const withParenthesisWhenNecesasry = (subExpression: HighIRExpression): PrettierDocument => {
        const subExpressionDocument = createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
          subExpression
        );
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

const concatStatements = (statements: readonly HighIRStatement[]) => {
  const documents = statements
    .map((it) => [createPrettierDocumentFromHighIRStatement_EXPOSED_FOR_TESTING(it), PRETTIER_LINE])
    .flat();
  if (documents.length === 0) return documents;
  return documents.slice(0, documents.length - 1);
};

export const createPrettierDocumentFromHighIRStatement_EXPOSED_FOR_TESTING = (
  highIRStatement: HighIRStatement
): PrettierDocument => {
  switch (highIRStatement.__type__) {
    case 'HighIRFunctionCallStatement': {
      const segments: PrettierDocument[] = [];
      if (highIRStatement.returnCollector != null) {
        segments.push(PRETTIER_TEXT(`var ${highIRStatement.returnCollector.name} = `));
      }
      segments.push(
        createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
          highIRStatement.functionExpression
        ),
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(
            highIRStatement.functionArguments,
            createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING
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
          createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
            highIRStatement.booleanExpression
          )
        ),
        PRETTIER_TEXT(' '),
        createBracesSurroundedBlockDocument(concatStatements(highIRStatement.s1)),
        PRETTIER_TEXT(' else '),
        createBracesSurroundedBlockDocument(concatStatements(highIRStatement.s2))
      );
    case 'HighIRLetDefinitionStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.name} = `),
        createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
          highIRStatement.assignedExpression
        ),
        PRETTIER_TEXT(';')
      );
    case 'HighIRStructInitializationStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.structVariableName} = `),
        createBracketSurroundedDocument(
          createCommaSeparatedList(
            highIRStatement.expressionList,
            createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING
          )
        ),
        PRETTIER_TEXT(';')
      );
    case 'HighIRReturnStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('return '),
        createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(highIRStatement.expression),
        PRETTIER_TEXT(';')
      );
  }
};

export const createPrettierDocumentFromHighIRFunction_EXPOSED_FOR_TESTING = (
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

export const createPrettierDocumentFromHighIRModule = (
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
  highIRModule.globalVariables.forEach(({ name, content }) => {
    segments.push(
      PRETTIER_TEXT(`const ${name} = "${escapeDoubleQuotes(content)}";`),
      PRETTIER_LINE
    );
  });
  highIRModule.functions.forEach((highIRFunction) =>
    segments.push(
      createPrettierDocumentFromHighIRFunction_EXPOSED_FOR_TESTING(highIRFunction),
      PRETTIER_LINE
    )
  );
  segments.push(
    PRETTIER_LINE,
    PRETTIER_TEXT(`${ENCODED_COMPILED_PROGRAM_MAIN}();`),
    PRETTIER_LINE,
    ...(forInterpreter ? [PRETTIER_TEXT('printed')] : [])
  );
  return PRETTIER_CONCAT(...segments);
};
