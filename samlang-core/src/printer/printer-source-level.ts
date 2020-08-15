import { prettyPrintLiteral } from '../ast/common/literals';
import { prettyPrintType } from '../ast/common/types';
import type { SamlangExpression } from '../ast/lang/samlang-expressions';
import {
  PrettierDocument,
  PRETTIER_NIL,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  PRETTIER_NO_SPACE_BRACKET,
  PRETTIER_SPACED_BRACKET,
  prettyPrintAccordingToPrettierAlgorithm,
} from './printer-prettier-core';

const createCommaSeparatedList = <E>(
  elements: readonly E[],
  documentCreator: (element: E) => PrettierDocument
): PrettierDocument => {
  if (elements.length === 0) return PRETTIER_NIL;
  if (elements.length === 1) return documentCreator(elements[0]);
  let base = documentCreator(elements[elements.length - 1]);
  for (let i = elements.length - 2; i >= 0; i -= 1) {
    base = PRETTIER_CONCAT(documentCreator(elements[i]), PRETTIER_TEXT(','), PRETTIER_LINE, base);
  }
  return base;
};

const createParenthesisSurroundedDocument = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_NO_SPACE_BRACKET('(', document, ')');

const createBracketSurroundedDocument = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_NO_SPACE_BRACKET('[', document, ']');

const createBracesSurroundedDocument = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_SPACED_BRACKET('{', document, '}');

const createPrettierDocumentFromSamlangExpression = (
  expression: SamlangExpression
): PrettierDocument => {
  switch (expression.__type__) {
    case 'LiteralExpression':
      return PRETTIER_TEXT(prettyPrintLiteral(expression.literal));
    case 'VariableExpression':
      return PRETTIER_TEXT(expression.name);
    case 'ThisExpression':
      return PRETTIER_TEXT('this');
    case 'ClassMemberExpression':
      return PRETTIER_TEXT(`${expression.className}.${expression.memberName}`);
    case 'TupleConstructorExpression':
      return createBracketSurroundedDocument(
        createCommaSeparatedList(
          expression.expressions,
          createPrettierDocumentFromSamlangExpression
        )
      );
    case 'ObjectConstructorExpression':
      return createBracesSurroundedDocument(
        createCommaSeparatedList(expression.fieldDeclarations, (fieldDeclaration) =>
          fieldDeclaration.expression == null
            ? PRETTIER_TEXT(fieldDeclaration.name)
            : PRETTIER_CONCAT(
                PRETTIER_TEXT(`${fieldDeclaration.name}: `),
                createPrettierDocumentFromSamlangExpression(fieldDeclaration.expression)
              )
        )
      );
    case 'VariantConstructorExpression':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(expression.tag),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.data)
        )
      );
    case 'FieldAccessExpression':
      return PRETTIER_CONCAT(
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.expression)
        ),
        PRETTIER_TEXT(`.${expression.fieldName}`)
      );
    case 'MethodAccessExpression':
      return PRETTIER_CONCAT(
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.expression)
        ),
        PRETTIER_TEXT(`.${expression.methodName}`)
      );
    case 'UnaryExpression':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`${expression.operator}`),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.expression)
        )
      );
    case 'PanicExpression':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('panic'),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.expression)
        )
      );
    case 'BuiltInFunctionCallExpression':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(expression.functionName),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.argumentExpression)
        )
      );
    case 'FunctionCallExpression':
      return PRETTIER_CONCAT(
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.functionExpression)
        ),
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(
            expression.functionArguments,
            createPrettierDocumentFromSamlangExpression
          )
        )
      );
    case 'BinaryExpression':
      return PRETTIER_CONCAT(
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.e1)
        ),
        PRETTIER_TEXT(` ${expression.operator.symbol} `),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.e2)
        )
      );
    case 'IfElseExpression':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('if '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.boolExpression)
        ),
        PRETTIER_TEXT(' then '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.e1)
        ),
        PRETTIER_TEXT(' else '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.e2)
        )
      );
    case 'MatchExpression': {
      const list = expression.matchingList
        .map(({ tag, dataVariable, expression: finalExpression }) => [
          PRETTIER_TEXT(`| ${tag} ${dataVariable ?? '_'} -> `),
          createParenthesisSurroundedDocument(
            createPrettierDocumentFromSamlangExpression(finalExpression)
          ),
          PRETTIER_LINE,
        ])
        .flat();
      return PRETTIER_CONCAT(
        PRETTIER_TEXT('match '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.matchedExpression)
        ),
        PRETTIER_TEXT(' '),
        createBracesSurroundedDocument(PRETTIER_CONCAT(...list.slice(0, list.length - 1)))
      );
    }
    case 'LambdaExpression':
      return PRETTIER_CONCAT(
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(expression.parameters, ([name, type]) =>
            PRETTIER_TEXT(`${name}: ${prettyPrintType(type)}`)
          )
        ),
        PRETTIER_TEXT(' -> '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(expression.body)
        )
      );
    case 'StatementBlockExpression': {
      const { statements, expression: finalExpression } = expression.block;
      const statementDocuments = statements
        .map(({ pattern, typeAnnotation, assignedExpression }) => {
          let patternDocument: PrettierDocument;
          switch (pattern.type) {
            case 'TuplePattern':
              patternDocument = createBracketSurroundedDocument(
                createCommaSeparatedList(pattern.destructedNames, (it) =>
                  PRETTIER_TEXT(it[0] ?? '_')
                )
              );
              break;
            case 'ObjectPattern':
              patternDocument = createBracesSurroundedDocument(
                createCommaSeparatedList(pattern.destructedNames, (it) =>
                  PRETTIER_TEXT(it.alias == null ? it.fieldName : `${it.fieldName} as ${it.alias}`)
                )
              );
              break;
            case 'VariablePattern':
              patternDocument = PRETTIER_TEXT(pattern.name);
              break;
            case 'WildCardPattern':
              patternDocument = PRETTIER_TEXT('_');
              break;
          }
          return [
            PRETTIER_TEXT('val '),
            patternDocument,
            PRETTIER_TEXT(`: ${prettyPrintType(typeAnnotation)} = `),
            createPrettierDocumentFromSamlangExpression(assignedExpression),
            PRETTIER_TEXT(';'),
            PRETTIER_LINE,
          ];
        })
        .flat();
      if (finalExpression == null) {
        return statementDocuments.length === 0
          ? createBracesSurroundedDocument(PRETTIER_CONCAT())
          : createBracesSurroundedDocument(
              PRETTIER_CONCAT(...statementDocuments.slice(0, statementDocuments.length - 1))
            );
      }
      return createBracesSurroundedDocument(
        PRETTIER_CONCAT(
          ...statementDocuments,
          createPrettierDocumentFromSamlangExpression(finalExpression)
        )
      );
    }
  }
};

// eslint-disable-next-line camelcase, import/prefer-default-export
export const prettyPrintSamlangExpression_EXPOSED_FOR_TESTING = (
  availableWidth: number,
  expression: SamlangExpression
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromSamlangExpression(expression)
  );
