import {
  MidIRStatement,
  MidIRFunction,
  MidIRSources,
  prettyPrintMidIRExpressionAsJSExpression,
} from 'samlang-core-ast/mir-nodes';

import {
  PrettierDocument,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  PRETTIER_NIL,
} from './printer-prettier-core';
import { createBracesSurroundedBlockDocument } from './printer-prettier-library';

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
      const pointerString = prettyPrintMidIRExpressionAsJSExpression(
        midIRStatement.pointerExpression
      );
      return PRETTIER_TEXT(
        `let ${midIRStatement.name} = ${pointerString}[${midIRStatement.index}];`
      );
    }
    case 'MidIRBinaryStatement': {
      const e1 = prettyPrintMidIRExpressionAsJSExpression(midIRStatement.e1);
      const e2 = prettyPrintMidIRExpressionAsJSExpression(midIRStatement.e2);
      const binaryExpressionString = `${e1} ${midIRStatement.operator} ${e2}`;
      const wrapped =
        midIRStatement.operator === '/'
          ? `Math.floor(${binaryExpressionString})`
          : binaryExpressionString;
      return PRETTIER_TEXT(`let ${midIRStatement.name} = ${wrapped};`);
    }
    case 'MidIRFunctionCallStatement': {
      const functionExpression = prettyPrintMidIRExpressionAsJSExpression(
        midIRStatement.functionExpression
      );
      const functionArguments = midIRStatement.functionArguments
        .map(prettyPrintMidIRExpressionAsJSExpression)
        .join(', ');
      const functionCallString = `${functionExpression}(${functionArguments});`;
      if (midIRStatement.returnCollector == null) return PRETTIER_TEXT(functionCallString);
      return PRETTIER_TEXT(`let ${midIRStatement.returnCollector} = ${functionCallString}`);
    }
    case 'MidIRIfElseStatement':
      return PRETTIER_CONCAT(
        ...midIRStatement.finalAssignments.flatMap((final) => [
          PRETTIER_TEXT(`let ${final.name};`),
          PRETTIER_LINE,
        ]),
        PRETTIER_TEXT(
          `if (${prettyPrintMidIRExpressionAsJSExpression(midIRStatement.booleanExpression)}) `
        ),
        createBracesSurroundedBlockDocument([
          ...concatStatements(midIRStatement.s1, manager),
          ...midIRStatement.finalAssignments.flatMap((final) => [
            PRETTIER_LINE,
            PRETTIER_TEXT(
              `${final.name} = ${prettyPrintMidIRExpressionAsJSExpression(final.branch1Value)};`
            ),
          ]),
        ]),
        PRETTIER_TEXT(' else '),
        createBracesSurroundedBlockDocument([
          ...concatStatements(midIRStatement.s2, manager),
          ...midIRStatement.finalAssignments.flatMap((final) => [
            PRETTIER_LINE,
            PRETTIER_TEXT(
              `${final.name} = ${prettyPrintMidIRExpressionAsJSExpression(final.branch2Value)};`
            ),
          ]),
        ])
      );
    case 'MidIRSingleIfStatement': {
      const boolString = prettyPrintMidIRExpressionAsJSExpression(midIRStatement.booleanExpression);
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`if (${midIRStatement.invertCondition ? `!${boolString}` : boolString}) `),
        createBracesSurroundedBlockDocument(concatStatements(midIRStatement.statements, manager))
      );
    }
    case 'MidIRBreakStatement': {
      const breakCollector = manager.currentBreakCollector;
      if (breakCollector == null) return PRETTIER_TEXT('break;');
      const breakValue = prettyPrintMidIRExpressionAsJSExpression(midIRStatement.breakValue);
      return PRETTIER_TEXT(`${breakCollector} = ${breakValue}; break;`);
    }
    case 'MidIRWhileStatement': {
      const breakCollectorName = midIRStatement.breakCollector?.name;
      return PRETTIER_CONCAT(
        ...midIRStatement.loopVariables.flatMap((loopVariable) => [
          PRETTIER_TEXT(
            `let ${loopVariable.name} = ${prettyPrintMidIRExpressionAsJSExpression(
              loopVariable.initialValue
            )};`
          ),
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
              PRETTIER_TEXT(
                `${loopVariable.name} = ${prettyPrintMidIRExpressionAsJSExpression(
                  loopVariable.loopValue
                )};`
              ),
            ]),
          ]),
        ])
      );
    }
    case 'MidIRCastStatement': {
      const assigned = prettyPrintMidIRExpressionAsJSExpression(midIRStatement.assignedExpression);
      return PRETTIER_CONCAT(PRETTIER_TEXT(`let ${midIRStatement.name} = ${assigned};`));
    }
    case 'MidIRStructInitializationStatement': {
      const expressions = midIRStatement.expressionList
        .map(prettyPrintMidIRExpressionAsJSExpression)
        .join(', ');
      return PRETTIER_TEXT(`let ${midIRStatement.structVariableName} = [${expressions}];`);
    }
  }
}

export const createPrettierDocumentFromMidIRStatement_EXPOSED_FOR_TESTING = (
  midIRStatement: MidIRStatement
): PrettierDocument =>
  createPrettierDocumentFromMidIRStatement(midIRStatement, new WhileLabelManager());

export function createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING(
  midIRFunction: MidIRFunction
): PrettierDocument {
  const returnStatementDocument = PRETTIER_TEXT(
    `return ${prettyPrintMidIRExpressionAsJSExpression(midIRFunction.returnValue)};`
  );
  return PRETTIER_CONCAT(
    PRETTIER_TEXT(`function ${midIRFunction.name}(${midIRFunction.parameters.join(', ')}) `),
    createBracesSurroundedBlockDocument(
      midIRFunction.body.length === 0
        ? [returnStatementDocument]
        : [
            ...concatStatements(midIRFunction.body, new WhileLabelManager()),
            PRETTIER_LINE,
            returnStatementDocument,
          ]
    )
  );
}

// Thanks https://gist.github.com/getify/3667624
const escapeDoubleQuotes = (string: string) => string.replace(/\\([\s\S])|(")/g, '\\$1$2');

export const createPrettierDocumentsForExportingModuleFromMidIRSources = (
  sources: MidIRSources
): readonly PrettierDocument[] => [
  ...sources.globalVariables.map(({ name, content }) =>
    PRETTIER_TEXT(`const ${name} = "${escapeDoubleQuotes(content)}";`)
  ),
  ...sources.functions.map((midIRFunction) =>
    createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING(midIRFunction)
  ),
];
