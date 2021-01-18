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
} from './printer-prettier-library';

import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from 'samlang-core-ast/common-names';
import type { HighIRStatement, HighIRExpression } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { checkNotNull } from 'samlang-core-utils';

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
  }
};

type LabelAndBreakCollector = { readonly label: string; readonly breakCollector?: string };

class WhileLabelManager {
  private labelStack: LabelAndBreakCollector[] = [];
  private nextLabelID = 0;

  get currentLabelAndBreakCollector(): LabelAndBreakCollector {
    return checkNotNull(this.labelStack[this.labelStack.length - 1]);
  }

  getBreakStatement(breakValue: HighIRExpression): readonly PrettierDocument[] {
    const { label, breakCollector } = this.currentLabelAndBreakCollector;
    if (breakCollector == null) {
      return [PRETTIER_LINE, PRETTIER_TEXT(`break ${label};`)];
    }
    return [
      PRETTIER_LINE,
      PRETTIER_TEXT(`var ${breakCollector} = `),
      createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(breakValue),
      PRETTIER_TEXT(';'),
      PRETTIER_LINE,
      PRETTIER_TEXT(`break ${label};`),
    ];
  }

  withNewNestedWhileLoop = <T>(breakCollector: string | undefined, block: () => T): T => {
    const id = this.nextLabelID;
    this.nextLabelID += 1;
    const label = `_while_label_${id}`;
    this.labelStack.push({ label, breakCollector });
    const result = block();
    this.labelStack.pop();
    return result;
  };
}

const concatStatements = (statements: readonly HighIRStatement[], manager: WhileLabelManager) => {
  const documents = statements
    .map((it) => [createPrettierDocumentFromHighIRStatement(it, manager), PRETTIER_LINE])
    .flat();
  if (documents.length === 0) return documents;
  return documents.slice(0, documents.length - 1);
};

export const createPrettierDocumentFromHighIRStatement = (
  highIRStatement: HighIRStatement,
  manager: WhileLabelManager
): PrettierDocument => {
  switch (highIRStatement.__type__) {
    case 'HighIRIndexAccessStatement': {
      const { pointerExpression, index } = highIRStatement;
      const subExpressionDocument = createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
        pointerExpression
      );
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.name} = `),
        subExpressionDocument,
        PRETTIER_TEXT(`[${index}];`)
      );
    }
    case 'HighIRBinaryStatement': {
      const { e1, e2, operator } = highIRStatement;
      const binaryExpressionDocument = PRETTIER_CONCAT(
        createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(e1),
        PRETTIER_TEXT(` ${operator} `),
        createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(e2)
      );
      const wrapped =
        operator === '/'
          ? PRETTIER_CONCAT(
              PRETTIER_TEXT('Math.floor'),
              createParenthesisSurroundedDocument(binaryExpressionDocument)
            )
          : binaryExpressionDocument;
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`var ${highIRStatement.name} = `),
        wrapped,
        PRETTIER_TEXT(';')
      );
    }
    case 'HighIRFunctionCallStatement': {
      const segments: PrettierDocument[] = [];
      if (highIRStatement.returnCollector != null) {
        segments.push(PRETTIER_TEXT(`var ${highIRStatement.returnCollector} = `));
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
        createBracesSurroundedBlockDocument([
          ...concatStatements(highIRStatement.s1, manager),
          ...(highIRStatement.s1BreakValue != null
            ? manager.getBreakStatement(highIRStatement.s1BreakValue)
            : highIRStatement.finalAssignments.flatMap((final) => [
                PRETTIER_LINE,
                PRETTIER_TEXT(`var ${final.name} = `),
                createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(final.branch1Value),
                PRETTIER_TEXT(';'),
              ])),
        ]),
        PRETTIER_TEXT(' else '),
        createBracesSurroundedBlockDocument([
          ...concatStatements(highIRStatement.s2, manager),
          ...(highIRStatement.s2BreakValue
            ? manager.getBreakStatement(highIRStatement.s2BreakValue)
            : highIRStatement.finalAssignments.flatMap((final) => [
                PRETTIER_LINE,
                PRETTIER_TEXT(`var ${final.name} = `),
                createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(final.branch2Value),
                PRETTIER_TEXT(';'),
              ])),
        ])
      );
    case 'HighIRSwitchStatement': {
      const docs: PrettierDocument[] = highIRStatement.cases.flatMap(
        ({ caseNumber, statements, breakValue }, i) => [
          PRETTIER_TEXT(`case ${caseNumber}: `),
          createBracesSurroundedBlockDocument([
            ...concatStatements(statements, manager),
            ...(breakValue != null
              ? manager.getBreakStatement(breakValue)
              : [
                  ...highIRStatement.finalAssignments.flatMap((final) => [
                    PRETTIER_LINE,
                    PRETTIER_TEXT(`var ${final.name} = `),
                    createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
                      checkNotNull(final.branchValues[i])
                    ),
                    PRETTIER_TEXT(';'),
                  ]),
                  PRETTIER_LINE,
                  PRETTIER_TEXT('break;'),
                ]),
          ]),
          PRETTIER_LINE,
        ]
      );
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`switch (${highIRStatement.caseVariable}) `),
        createBracesSurroundedBlockDocument(docs.slice(0, docs.length - 1))
      );
    }
    case 'HighIRWhileStatement': {
      return PRETTIER_CONCAT(
        ...highIRStatement.loopVariables.flatMap((loopVariable) => [
          PRETTIER_TEXT(`var ${loopVariable.name} = `),
          createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(loopVariable.initialValue),
          PRETTIER_TEXT(';'),
          PRETTIER_LINE,
        ]),
        ...manager.withNewNestedWhileLoop(highIRStatement.breakCollector?.name, () => [
          PRETTIER_TEXT(`${manager.currentLabelAndBreakCollector.label}:`),
          PRETTIER_LINE,
          PRETTIER_TEXT('while (true) '),
          createBracesSurroundedBlockDocument([
            ...concatStatements(highIRStatement.statements, manager),
            ...highIRStatement.loopVariables.flatMap((loopVariable) => [
              PRETTIER_LINE,
              PRETTIER_TEXT(`${loopVariable.name} = `),
              createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(
                loopVariable.loopValue
              ),
              PRETTIER_TEXT(';'),
            ]),
          ]),
        ])
      );
    }
    case 'HighIRCastStatement':
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

export const createPrettierDocumentFromHighIRStatement_EXPOSED_FOR_TESTING = (
  highIRStatement: HighIRStatement
): PrettierDocument =>
  createPrettierDocumentFromHighIRStatement(highIRStatement, new WhileLabelManager());

export const createPrettierDocumentFromHighIRFunction_EXPOSED_FOR_TESTING = (
  highIRFunction: HighIRFunction
): PrettierDocument =>
  PRETTIER_CONCAT(
    PRETTIER_TEXT(`const ${highIRFunction.name} = `),
    createParenthesisSurroundedDocument(
      createCommaSeparatedList(highIRFunction.parameters, PRETTIER_TEXT)
    ),
    PRETTIER_TEXT(' => '),
    createBracesSurroundedBlockDocument(
      concatStatements(highIRFunction.body, new WhileLabelManager())
    ),
    PRETTIER_TEXT(';')
  );

export const createPrettierDocumentFromHighIRModule = (
  highIRModule: HighIRModule,
  forInterpreter: boolean
): PrettierDocument => {
  const segments: PrettierDocument[] = [
    ...(forInterpreter ? [PRETTIER_TEXT("var printed = '';"), PRETTIER_LINE, PRETTIER_LINE] : []),
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
