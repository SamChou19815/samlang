import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from 'samlang-core-ast/common-names';
import type {
  MidIRStatement,
  MidIRExpression,
  MidIRFunction,
  MidIRSources,
} from 'samlang-core-ast/mir-nodes';

import {
  PrettierDocument,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  PRETTIER_NIL,
} from './printer-prettier-core';
import {
  createCommaSeparatedList,
  createParenthesisSurroundedDocument,
  createBracketSurroundedDocument,
  createBracesSurroundedBlockDocument,
  createBracesSurroundedDocument,
} from './printer-prettier-library';

// Thanks https://gist.github.com/getify/3667624
const escapeDoubleQuotes = (string: string) => string.replace(/\\([\s\S])|(")/g, '\\$1$2');

export function createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(
  midIRExpression: MidIRExpression
): PrettierDocument {
  switch (midIRExpression.__type__) {
    case 'MidIRIntLiteralExpression':
      return PRETTIER_TEXT(String(midIRExpression.value));
    case 'MidIRVariableExpression':
    case 'MidIRNameExpression':
      return PRETTIER_TEXT(midIRExpression.name);
  }
}

class WhileLabelManager {
  private stack: (string | undefined)[] = [];

  get currentBreakCollector(): string | undefined {
    return this.stack[this.stack.length - 1];
  }

  withNewNestedWhileLoop = <T>(breakCollector: string | undefined, block: () => T): T => {
    this.stack.push(breakCollector);
    const result = block();
    this.stack.pop();
    return result;
  };
}

function concatStatements(statements: readonly MidIRStatement[], manager: WhileLabelManager) {
  const documents = statements
    .map((it) => [createPrettierDocumentFromMidIRStatement(it, manager), PRETTIER_LINE])
    .flat();
  if (documents.length === 0) return documents;
  return documents.slice(0, documents.length - 1);
}

export function createPrettierDocumentFromMidIRStatement(
  midIRStatement: MidIRStatement,
  manager: WhileLabelManager
): PrettierDocument {
  switch (midIRStatement.__type__) {
    case 'MidIRIndexAccessStatement': {
      const { pointerExpression, index } = midIRStatement;
      const subExpressionDocument =
        createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(pointerExpression);
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`let ${midIRStatement.name} = `),
        subExpressionDocument,
        PRETTIER_TEXT(`[${index}];`)
      );
    }
    case 'MidIRBinaryStatement': {
      const { e1, e2, operator } = midIRStatement;
      const binaryExpressionDocument = PRETTIER_CONCAT(
        createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(e1),
        PRETTIER_TEXT(` ${operator} `),
        createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(e2)
      );
      const wrapped =
        operator === '/'
          ? PRETTIER_CONCAT(
              PRETTIER_TEXT('Math.floor'),
              createParenthesisSurroundedDocument(binaryExpressionDocument)
            )
          : binaryExpressionDocument;
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`let ${midIRStatement.name} = `),
        wrapped,
        PRETTIER_TEXT(';')
      );
    }
    case 'MidIRFunctionCallStatement': {
      const segments: PrettierDocument[] = [];
      if (midIRStatement.returnCollector != null) {
        segments.push(PRETTIER_TEXT(`let ${midIRStatement.returnCollector} = `));
      }
      segments.push(
        createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(
          midIRStatement.functionExpression
        ),
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(
            midIRStatement.functionArguments,
            createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING
          )
        ),
        PRETTIER_TEXT(';')
      );
      return PRETTIER_CONCAT(...segments);
    }
    case 'MidIRIfElseStatement':
      return PRETTIER_CONCAT(
        ...midIRStatement.finalAssignments.flatMap((final) => [
          PRETTIER_TEXT(`let ${final.name};`),
          PRETTIER_LINE,
        ]),
        PRETTIER_TEXT('if '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(
            midIRStatement.booleanExpression
          )
        ),
        PRETTIER_TEXT(' '),
        createBracesSurroundedBlockDocument([
          ...concatStatements(midIRStatement.s1, manager),
          ...midIRStatement.finalAssignments.flatMap((final) => [
            PRETTIER_LINE,
            PRETTIER_TEXT(`${final.name} = `),
            createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(final.branch1Value),
            PRETTIER_TEXT(';'),
          ]),
        ]),
        PRETTIER_TEXT(' else '),
        createBracesSurroundedBlockDocument([
          ...concatStatements(midIRStatement.s2, manager),
          ...midIRStatement.finalAssignments.flatMap((final) => [
            PRETTIER_LINE,
            PRETTIER_TEXT(`${final.name} = `),
            createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(final.branch2Value),
            PRETTIER_TEXT(';'),
          ]),
        ])
      );
    case 'MidIRSingleIfStatement': {
      const boolDocument = createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(
        midIRStatement.booleanExpression
      );
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('if '),
        createParenthesisSurroundedDocument(
          midIRStatement.invertCondition
            ? PRETTIER_CONCAT(PRETTIER_TEXT('!'), boolDocument)
            : boolDocument
        ),
        PRETTIER_TEXT(' '),
        createBracesSurroundedBlockDocument(concatStatements(midIRStatement.statements, manager))
      );
    }
    case 'MidIRBreakStatement': {
      const breakCollector = manager.currentBreakCollector;
      if (breakCollector == null) {
        return PRETTIER_TEXT('break;');
      }
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`${breakCollector} = `),
        createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(midIRStatement.breakValue),
        PRETTIER_TEXT('; break;')
      );
    }
    case 'MidIRWhileStatement': {
      const breakCollectorName = midIRStatement.breakCollector?.name;
      return PRETTIER_CONCAT(
        ...midIRStatement.loopVariables.flatMap((loopVariable) => [
          PRETTIER_TEXT(`let ${loopVariable.name} = `),
          createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(loopVariable.initialValue),
          PRETTIER_TEXT(';'),
          PRETTIER_LINE,
        ]),
        breakCollectorName != null
          ? PRETTIER_CONCAT(PRETTIER_TEXT(`let ${breakCollectorName};`), PRETTIER_LINE)
          : PRETTIER_NIL,
        ...manager.withNewNestedWhileLoop(breakCollectorName, () => [
          PRETTIER_TEXT('while (true) '),
          createBracesSurroundedBlockDocument([
            ...concatStatements(midIRStatement.statements, manager),
            ...midIRStatement.loopVariables.flatMap((loopVariable) => [
              PRETTIER_LINE,
              PRETTIER_TEXT(`${loopVariable.name} = `),
              createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(loopVariable.loopValue),
              PRETTIER_TEXT(';'),
            ]),
          ]),
        ])
      );
    }
    case 'MidIRCastStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`let ${midIRStatement.name} = `),
        createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(
          midIRStatement.assignedExpression
        ),
        PRETTIER_TEXT(';')
      );
    case 'MidIRStructInitializationStatement':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`let ${midIRStatement.structVariableName} = `),
        createBracketSurroundedDocument(
          createCommaSeparatedList(
            midIRStatement.expressionList,
            createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING
          )
        ),
        PRETTIER_TEXT(';')
      );
  }
}

export const createPrettierDocumentFromMidIRStatement_EXPOSED_FOR_TESTING = (
  midIRStatement: MidIRStatement
): PrettierDocument =>
  createPrettierDocumentFromMidIRStatement(midIRStatement, new WhileLabelManager());

export function createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING(
  midIRFunction: MidIRFunction
): PrettierDocument {
  const returnStatementDocument = PRETTIER_CONCAT(
    PRETTIER_TEXT('return '),
    createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(midIRFunction.returnValue),
    PRETTIER_TEXT(';')
  );
  return PRETTIER_CONCAT(
    PRETTIER_TEXT(`const ${midIRFunction.name} = `),
    createParenthesisSurroundedDocument(
      createCommaSeparatedList(midIRFunction.parameters, PRETTIER_TEXT)
    ),
    PRETTIER_TEXT(' => '),
    createBracesSurroundedBlockDocument(
      midIRFunction.body.length === 0
        ? [returnStatementDocument]
        : [
            ...concatStatements(midIRFunction.body, new WhileLabelManager()),
            PRETTIER_LINE,
            returnStatementDocument,
          ]
    ),
    PRETTIER_TEXT(';')
  );
}

function createPrettierDocumentFromMidIRSourcesWithCustomizedInvocation({
  sources,
  printerImplementation,
  prolog,
  epilog,
}: {
  readonly sources: MidIRSources;
  readonly printerImplementation: string;
  readonly prolog: readonly PrettierDocument[];
  readonly epilog: readonly PrettierDocument[];
}): PrettierDocument {
  const segments: PrettierDocument[] = [...prolog];
  segments.push(
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;`),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => ${printerImplementation}`),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => parseInt(v, 10);`),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);`),
    PRETTIER_LINE,
    PRETTIER_TEXT(`const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };`),
    PRETTIER_LINE,
    PRETTIER_LINE
  );
  sources.globalVariables.forEach(({ name, content }) => {
    segments.push(
      PRETTIER_TEXT(`const ${name} = "${escapeDoubleQuotes(content)}";`),
      PRETTIER_LINE
    );
  });
  sources.functions.forEach((midIRFunction) =>
    segments.push(
      createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING(midIRFunction),
      PRETTIER_LINE
    )
  );
  segments.push(...epilog);
  return PRETTIER_CONCAT(...segments);
}

export const createPrettierDocumentForExportingModuleFromMidIRSources = (
  sources: MidIRSources
): PrettierDocument =>
  createPrettierDocumentFromMidIRSourcesWithCustomizedInvocation({
    sources,
    printerImplementation: 'console.log(line);',
    prolog: [],
    epilog: [
      PRETTIER_LINE,
      PRETTIER_TEXT(`module.exports = `),
      createBracesSurroundedDocument(
        createCommaSeparatedList(sources.mainFunctionNames, PRETTIER_TEXT)
      ),
      PRETTIER_TEXT(';'),
    ],
  });

export const createPrettierDocumentForInterpreterFromMidIRSources = (
  sources: MidIRSources
): PrettierDocument =>
  createPrettierDocumentFromMidIRSourcesWithCustomizedInvocation({
    sources,
    printerImplementation: '{ printed += line; printed += "\\n" };',
    prolog: [],
    epilog: [],
  });

export const createPrettierDocumentFromMidIRSources = (
  sources: MidIRSources,
  forInterpreter: boolean
): PrettierDocument =>
  createPrettierDocumentFromMidIRSourcesWithCustomizedInvocation({
    sources,
    printerImplementation: forInterpreter
      ? '{ printed += line; printed += "\\n" };'
      : 'console.log(line);',
    prolog: forInterpreter
      ? [PRETTIER_TEXT("var printed = '';"), PRETTIER_LINE, PRETTIER_LINE]
      : [],
    epilog: [
      PRETTIER_LINE,
      PRETTIER_TEXT(`${ENCODED_COMPILED_PROGRAM_MAIN}();`),
      PRETTIER_LINE,
      ...(forInterpreter ? [PRETTIER_TEXT('printed')] : []),
    ],
  });
