import {
  PrettierDocument,
  PRETTIER_NIL,
  PRETTIER_CONCAT,
  PRETTIER_NEST,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  PRETTIER_GROUP,
  PRETTIER_MULTILINE_COMMENT,
  prettyPrintAccordingToPrettierAlgorithm,
} from './printer-prettier-core';
import {
  createCommaSeparatedList,
  createParenthesisSurroundedDocument,
  createBracketSurroundedDocument,
  createBracesSurroundedDocument,
  createBracesSurroundedBlockDocument,
} from './printer-prettier-library';

import { prettyPrintLiteral, prettyPrintType } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression, IfElseExpression } from 'samlang-core-ast/samlang-expressions';
import type {
  ClassMemberDefinition,
  ClassDefinition,
  ModuleMembersImport,
  SamlangModule,
} from 'samlang-core-ast/samlang-toplevel';

const createPrettierDocumentFromSamlangExpression = (
  expression: SamlangExpression
): PrettierDocument => {
  const createDocumentForSubExpressionConsideringPrecedenceLevel = (
    subExpression: SamlangExpression
  ): PrettierDocument => {
    if (subExpression.precedence >= expression.precedence) {
      return createParenthesisSurroundedDocument(
        createPrettierDocumentFromSamlangExpression(subExpression)
      );
    }
    return createPrettierDocumentFromSamlangExpression(subExpression);
  };

  const createDocumentIfElseExpression = (ifElse: IfElseExpression): PrettierDocument => {
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
  };

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
        createDocumentForSubExpressionConsideringPrecedenceLevel(expression.expression),
        PRETTIER_TEXT(`.${expression.fieldName}`)
      );
    case 'MethodAccessExpression':
      return PRETTIER_CONCAT(
        createDocumentForSubExpressionConsideringPrecedenceLevel(expression.expression),
        PRETTIER_TEXT(`.${expression.methodName}`)
      );
    case 'UnaryExpression':
      return PRETTIER_CONCAT(
        PRETTIER_TEXT(`${expression.operator}`),
        createDocumentForSubExpressionConsideringPrecedenceLevel(expression.expression)
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
        createDocumentForSubExpressionConsideringPrecedenceLevel(expression.functionExpression),
        createParenthesisSurroundedDocument(
          createCommaSeparatedList(
            expression.functionArguments,
            createPrettierDocumentFromSamlangExpression
          )
        )
      );
    case 'BinaryExpression':
      return PRETTIER_CONCAT(
        createDocumentForSubExpressionConsideringPrecedenceLevel(expression.e1),
        PRETTIER_TEXT(` ${expression.operator.symbol} `),
        createDocumentForSubExpressionConsideringPrecedenceLevel(expression.e2)
      );
    case 'IfElseExpression':
      return createDocumentIfElseExpression(expression);
    case 'MatchExpression': {
      const list = expression.matchingList
        .map(({ tag, dataVariable, expression: finalExpression }) => [
          PRETTIER_TEXT(`| ${tag} ${dataVariable?.[0] ?? '_'} -> `),
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
          createCommaSeparatedList(expression.parameters, ([name, type]) =>
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
        .map(({ pattern, typeAnnotation, assignedExpression }) => {
          let patternDocument: PrettierDocument;
          switch (pattern.type) {
            case 'TuplePattern':
              patternDocument = createBracketSurroundedDocument(
                createCommaSeparatedList(pattern.destructedNames, (it) =>
                  PRETTIER_TEXT(it.name ?? '_')
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
            typeAnnotation.type === 'UndecidedType'
              ? PRETTIER_NIL
              : PRETTIER_TEXT(`: ${prettyPrintType(typeAnnotation)}`),
            PRETTIER_TEXT(' = '),
            createPrettierDocumentFromSamlangExpression(assignedExpression),
            PRETTIER_TEXT(';'),
            PRETTIER_LINE,
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
};

export const prettyPrintSamlangExpression_EXPOSED_FOR_TESTING = (
  availableWidth: number,
  expression: SamlangExpression
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromSamlangExpression(expression)
  );

export const createPrettierDocumentsFromSamlangClassMember = (
  member: ClassMemberDefinition
): readonly PrettierDocument[] => {
  const bodyDocument = createPrettierDocumentFromSamlangExpression(member.body);

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
    member.documentText == null
      ? PRETTIER_NIL
      : PRETTIER_MULTILINE_COMMENT('/**', member.documentText),
    member.isPublic ? PRETTIER_NIL : PRETTIER_TEXT('private '),
    PRETTIER_TEXT(member.isMethod ? 'method ' : 'function '),
    member.typeParameters.length > 0
      ? PRETTIER_TEXT(`<${member.typeParameters.join(', ')}> `)
      : PRETTIER_NIL,
    PRETTIER_TEXT(member.name),
    createParenthesisSurroundedDocument(
      createCommaSeparatedList(member.parameters, (annotated) =>
        PRETTIER_TEXT(`${annotated.name}: ${prettyPrintType(annotated.type)}`)
      )
    ),
    PRETTIER_TEXT(`: ${prettyPrintType(member.type.returnType)} =`),
    bodyDocumentWithPotentialIndentation,
    PRETTIER_LINE,
    PRETTIER_LINE,
  ];
};

const createPrettierDocumentForImport = (oneImport: ModuleMembersImport): PrettierDocument =>
  PRETTIER_CONCAT(
    PRETTIER_TEXT('import '),
    createBracesSurroundedDocument(
      createCommaSeparatedList(oneImport.importedMembers, ([name]) => PRETTIER_TEXT(name))
    ),
    PRETTIER_TEXT(` from ${oneImport.importedModule.parts.join('.')}`),
    PRETTIER_LINE
  );

const createPrettierDocumentsForClassDefinition = (
  classDefinition: ClassDefinition
): readonly PrettierDocument[] => {
  const typeMappings = Object.entries(classDefinition.typeDefinition.mappings);
  const classMembersDocuments = classDefinition.members
    .map(createPrettierDocumentsFromSamlangClassMember)
    .flat();
  if (classMembersDocuments.length > 1) classMembersDocuments.pop();

  return [
    classDefinition.documentText == null
      ? PRETTIER_NIL
      : PRETTIER_MULTILINE_COMMENT('/**', classDefinition.documentText),
    PRETTIER_TEXT(`class ${classDefinition.name}`),
    PRETTIER_TEXT(
      classDefinition.typeParameters.length === 0
        ? ''
        : `<${classDefinition.typeParameters.join(', ')}>`
    ),
    typeMappings.length === 0
      ? PRETTIER_NIL
      : createParenthesisSurroundedDocument(
          createCommaSeparatedList(typeMappings, ([name, type]) => {
            if (classDefinition.typeDefinition.type === 'object') {
              // istanbul ignore next
              const modifier = type.isPublic ? '' : 'private ';
              return PRETTIER_TEXT(`${modifier}val ${name}: ${prettyPrintType(type.type)}`);
            }
            return PRETTIER_TEXT(`${name}(${prettyPrintType(type.type)})`);
          })
        ),
    PRETTIER_TEXT(' '),
    createBracesSurroundedDocument(PRETTIER_CONCAT(...classMembersDocuments)),
    PRETTIER_LINE,
    PRETTIER_LINE,
  ];
};

const createPrettierDocumentForSamlangModule = ({
  imports,
  classes,
}: SamlangModule): PrettierDocument => {
  const importsDocuments = imports.map(createPrettierDocumentForImport);
  const classDocuments = classes.map(createPrettierDocumentsForClassDefinition).flat();

  if (importsDocuments.length === 0) return PRETTIER_CONCAT(...classDocuments);
  return PRETTIER_CONCAT(...importsDocuments, PRETTIER_LINE, ...classDocuments);
};

export default createPrettierDocumentForSamlangModule;
