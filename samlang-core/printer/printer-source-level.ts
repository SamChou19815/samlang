import { prettyPrintLiteral, TypedComment } from '../ast/common-nodes';
import {
  IfElseExpression,
  prettyPrintType,
  SamlangExpression,
  SamlangType,
  SourceClassMemberDeclaration,
} from '../ast/samlang-nodes';
import { checkNotNull } from '../utils';
import {
  PrettierDocument,
  PRETTIER_CONCAT,
  PRETTIER_EXTENSION_LINE_HARD,
  PRETTIER_GROUP,
  PRETTIER_LINE,
  PRETTIER_LINE_COMMENT,
  PRETTIER_MULTILINE_COMMENT,
  PRETTIER_NEST,
  PRETTIER_NIL,
  PRETTIER_TEXT,
  prettyPrintAccordingToPrettierAlgorithm,
} from './printer-prettier-core';
import {
  createBracesSurroundedBlockDocument,
  createBracesSurroundedDocument,
  createCommaSeparatedList,
  createParenthesisSurroundedDocument,
} from './printer-prettier-library';

export function createPrettierDocumentForAssociatedComments(
  associatedComments: readonly TypedComment[],
  addFinalLineBreak: boolean
): PrettierDocument | null {
  const documents = associatedComments.flatMap((precedingComment) => {
    switch (precedingComment.type) {
      case 'line':
        return [PRETTIER_LINE_COMMENT(precedingComment.text), PRETTIER_EXTENSION_LINE_HARD];
      case 'block':
        return [PRETTIER_MULTILINE_COMMENT('/*', precedingComment.text), PRETTIER_LINE];
      case 'doc':
        return [PRETTIER_MULTILINE_COMMENT('/**', precedingComment.text), PRETTIER_LINE];
    }
  });
  if (documents.length === 0) return null;
  const finalLineBreakIsSoft = checkNotNull(documents[documents.length - 1]).__type__ === 'LINE';
  if (finalLineBreakIsSoft) documents.pop();
  const finalMainDocument = PRETTIER_GROUP(PRETTIER_CONCAT(...documents));
  return addFinalLineBreak && finalLineBreakIsSoft
    ? PRETTIER_CONCAT(finalMainDocument, PRETTIER_LINE)
    : finalMainDocument;
}

const optionalTypeArguments = (typeArguments: readonly SamlangType[]) =>
  typeArguments.length > 0 ? `<${typeArguments.map(prettyPrintType).join(', ')}>` : '';

function createPrettierDocumentFromSamlangExpression(
  expression: SamlangExpression
): PrettierDocument {
  function createDocumentForSubExpressionConsideringPrecedenceLevel(
    subExpression: SamlangExpression,
    equalLevelParenthesis = false
  ): PrettierDocument {
    const addParenthesis = equalLevelParenthesis
      ? subExpression.precedence >= expression.precedence
      : subExpression.precedence > expression.precedence;
    if (addParenthesis) {
      return createParenthesisSurroundedDocument(
        createPrettierDocumentFromSamlangExpression(subExpression)
      );
    }
    return createPrettierDocumentFromSamlangExpression(subExpression);
  }

  function createDocumentIfElseExpression(ifElse: IfElseExpression): PrettierDocument {
    const documents: PrettierDocument[] = [];
    let ifElseExpression: SamlangExpression = ifElse;
    do {
      documents.push(
        PRETTIER_TEXT('if '),
        createParenthesisSurroundedDocument(
          createPrettierDocumentFromSamlangExpression(ifElseExpression.boolExpression)
        ),
        PRETTIER_TEXT(' then '),
        createDocumentForSubExpressionConsideringPrecedenceLevel(ifElseExpression.e1),
        PRETTIER_TEXT(' else ')
      );
      ifElseExpression = ifElseExpression.e2;
    } while (ifElseExpression.__type__ === 'IfElseExpression');
    documents.push(createDocumentForSubExpressionConsideringPrecedenceLevel(ifElseExpression));
    return PRETTIER_CONCAT(...documents);
  }

  function createDocumentDottedExpression(
    base: PrettierDocument,
    comments: readonly TypedComment[],
    member: string
  ) {
    const memberPrecedingCommentsDoc = createPrettierDocumentForAssociatedComments(comments, true);
    const memberPrecedingCommentsDocs =
      memberPrecedingCommentsDoc != null
        ? PRETTIER_GROUP(PRETTIER_CONCAT(PRETTIER_LINE, memberPrecedingCommentsDoc))
        : PRETTIER_NIL;
    return PRETTIER_CONCAT(
      base,
      memberPrecedingCommentsDocs,
      PRETTIER_TEXT('.'),
      PRETTIER_TEXT(member)
    );
  }

  const precedingCommentDoc = createPrettierDocumentForAssociatedComments(
    expression.associatedComments,
    true
  );

  const documentWithoutPrecedingComment = (() => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return PRETTIER_TEXT(prettyPrintLiteral(expression.literal));
      case 'VariableExpression':
        return PRETTIER_TEXT(expression.name);
      case 'ThisExpression':
        return PRETTIER_TEXT('this');
      case 'ClassMemberExpression': {
        return createDocumentDottedExpression(
          PRETTIER_TEXT(expression.className.name),
          expression.memberName.associatedComments,
          optionalTypeArguments(expression.typeArguments) + expression.memberName.name
        );
      }
      case 'FieldAccessExpression':
        return createDocumentDottedExpression(
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.expression),
          expression.fieldName.associatedComments,
          expression.fieldName.name
        );
      case 'MethodAccessExpression':
        return createDocumentDottedExpression(
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.expression),
          expression.methodName.associatedComments,
          expression.methodName.name
        );
      case 'UnaryExpression':
        return PRETTIER_CONCAT(
          PRETTIER_TEXT(`${expression.operator}`),
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.expression)
        );
      case 'FunctionCallExpression':
        return PRETTIER_CONCAT(
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.functionExpression),
          createParenthesisSurroundedDocument(
            createCommaSeparatedList(
              expression.functionArguments,
              createPrettierDocumentFromSamlangExpression
            )
          )
        );
      case 'BinaryExpression': {
        const operatorPrecedingCommentsDoc = createPrettierDocumentForAssociatedComments(
          expression.operatorPrecedingComments,
          false
        );
        const operatorPrecedingCommentsDocs =
          operatorPrecedingCommentsDoc != null
            ? PRETTIER_GROUP(PRETTIER_CONCAT(PRETTIER_LINE, operatorPrecedingCommentsDoc))
            : PRETTIER_NIL;
        if (expression.e1.precedence === expression.precedence) {
          // Since we are doing left to right evaluation, this is safe.
          return PRETTIER_CONCAT(
            createPrettierDocumentFromSamlangExpression(expression.e1),
            operatorPrecedingCommentsDocs,
            PRETTIER_TEXT(` ${expression.operator.symbol} `),
            createDocumentForSubExpressionConsideringPrecedenceLevel(expression.e2, true)
          );
        }
        if (expression.e2.precedence === expression.precedence) {
          // For the commutative operators, we can remove parentheses.
          switch (expression.operator.symbol) {
            case '-':
            case '/':
            case '%':
              break;
            default:
              return PRETTIER_CONCAT(
                createDocumentForSubExpressionConsideringPrecedenceLevel(expression.e1, true),
                operatorPrecedingCommentsDocs,
                PRETTIER_TEXT(` ${expression.operator.symbol} `),
                createPrettierDocumentFromSamlangExpression(expression.e2)
              );
          }
        }
        return PRETTIER_CONCAT(
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.e1, true),
          operatorPrecedingCommentsDocs,
          PRETTIER_TEXT(` ${expression.operator.symbol} `),
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.e2, true)
        );
      }
      case 'IfElseExpression':
        return createDocumentIfElseExpression(expression);
      case 'MatchExpression': {
        const list = expression.matchingList
          .map(({ tag, dataVariable, expression: finalExpression }) => [
            PRETTIER_TEXT(`| ${tag.name} ${dataVariable?.[0].name ?? '_'} -> `),
            createDocumentForSubExpressionConsideringPrecedenceLevel(finalExpression),
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
            createCommaSeparatedList(expression.parameters, ([{ name }, type]) =>
              PRETTIER_TEXT(
                type.type === 'UndecidedType' ? name : `${name}: ${prettyPrintType(type)}`
              )
            )
          ),
          PRETTIER_TEXT(' -> '),
          createDocumentForSubExpressionConsideringPrecedenceLevel(expression.body)
        );
      case 'StatementBlockExpression': {
        const { statements, expression: finalExpression } = expression.block;
        const segments = statements
          .map(({ pattern, typeAnnotation, assignedExpression, associatedComments }) => {
            let patternDocument: PrettierDocument;
            switch (pattern.type) {
              case 'ObjectPattern':
                patternDocument = createBracesSurroundedDocument(
                  createCommaSeparatedList(pattern.destructedNames, (it) =>
                    PRETTIER_TEXT(
                      it.alias == null
                        ? it.fieldName.name
                        : `${it.fieldName.name} as ${it.alias.name}`
                    )
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
              createPrettierDocumentForAssociatedComments(associatedComments, true) ?? PRETTIER_NIL,
              PRETTIER_TEXT('val '),
              patternDocument,
              typeAnnotation == null
                ? PRETTIER_NIL
                : PRETTIER_TEXT(`: ${prettyPrintType(typeAnnotation)}`),
              PRETTIER_TEXT(' = '),
              createPrettierDocumentFromSamlangExpression(assignedExpression),
              PRETTIER_TEXT(';'),
              PRETTIER_EXTENSION_LINE_HARD,
            ];
          })
          .flat();
        const finalExpressionDocument =
          finalExpression == null
            ? null
            : createPrettierDocumentFromSamlangExpression(finalExpression);
        if (segments.length === 0) {
          return createBracesSurroundedDocument(finalExpressionDocument ?? PRETTIER_NIL);
        }
        if (finalExpressionDocument == null) {
          segments.pop();
        } else {
          segments.push(finalExpressionDocument);
        }
        return createBracesSurroundedBlockDocument(segments);
      }
    }
  })();

  return precedingCommentDoc != null
    ? PRETTIER_GROUP(PRETTIER_CONCAT(precedingCommentDoc, documentWithoutPrecedingComment))
    : documentWithoutPrecedingComment;
}

export function prettyPrintSamlangExpression_EXPOSED_FOR_TESTING(
  availableWidth: number,
  expression: SamlangExpression
): string {
  return prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromSamlangExpression(expression)
  );
}

export function createPrettierDocumentsFromSamlangInterfaceMember(
  member: SourceClassMemberDeclaration & { readonly body?: SamlangExpression }
): readonly PrettierDocument[] {
  const bodyDocument =
    member.body == null ? PRETTIER_NIL : createPrettierDocumentFromSamlangExpression(member.body);

  // Special case for statement block as body for prettier result.
  // We want to lift the leading `{` to the same line as `=`.
  let bodyDocumentWithPotentialIndentation: PrettierDocument;
  if (
    bodyDocument.__type__ === 'CONCAT' &&
    bodyDocument.doc1.__type__ === 'TEXT' &&
    bodyDocument.doc1.text === '{'
  ) {
    bodyDocumentWithPotentialIndentation = PRETTIER_CONCAT(PRETTIER_TEXT(' {'), bodyDocument.doc2);
  } else {
    bodyDocumentWithPotentialIndentation = PRETTIER_GROUP(
      PRETTIER_NEST(2, PRETTIER_CONCAT(PRETTIER_LINE, bodyDocument))
    );
  }

  return [
    createPrettierDocumentForAssociatedComments(member.associatedComments, true) ?? PRETTIER_NIL,
    member.isPublic ? PRETTIER_NIL : PRETTIER_TEXT('private '),
    PRETTIER_TEXT(member.isMethod ? 'method ' : 'function '),
    member.typeParameters.length > 0
      ? PRETTIER_TEXT(`<${member.typeParameters.map((it) => it.name).join(', ')}> `)
      : PRETTIER_NIL,
    PRETTIER_TEXT(member.name.name),
    createParenthesisSurroundedDocument(
      createCommaSeparatedList(member.parameters, (annotated) =>
        PRETTIER_TEXT(`${annotated.name}: ${prettyPrintType(annotated.type)}`)
      )
    ),
    PRETTIER_TEXT(`: ${prettyPrintType(member.type.returnType)}${member.body == null ? '' : ' ='}`),
    bodyDocumentWithPotentialIndentation,
  ];
}
