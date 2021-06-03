/**
 * A set of functions that are not necessary to be built into Prettier core,
 * but commonly used enough that deserves its own file
 */

import { checkNotNull } from 'samlang-core-utils';

import {
  PrettierDocument,
  PRETTIER_NIL,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_NEST,
  PRETTIER_LINE,
  PRETTIER_NO_SPACE_BRACKET,
  PRETTIER_SPACED_BRACKET,
} from './printer-prettier-core';

export const createCommaSeparatedList = <E>(
  elements: readonly E[],
  documentCreator: (element: E) => PrettierDocument
): PrettierDocument => {
  if (elements.length === 0) return PRETTIER_NIL;
  if (elements.length === 1) return documentCreator(checkNotNull(elements[0]));
  let base = documentCreator(checkNotNull(elements[elements.length - 1]));
  for (let i = elements.length - 2; i >= 0; i -= 1) {
    base = PRETTIER_CONCAT(
      documentCreator(checkNotNull(elements[i])),
      PRETTIER_TEXT(','),
      PRETTIER_LINE,
      base
    );
  }
  return base;
};

export const createParenthesisSurroundedDocument = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_NO_SPACE_BRACKET('(', document, ')');

export const createBracketSurroundedDocument = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_NO_SPACE_BRACKET('[', document, ']');

export const createBracesSurroundedDocument = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_SPACED_BRACKET('{', document, '}');

export const createBracesSurroundedBlockDocument = (
  documents: readonly PrettierDocument[]
): PrettierDocument =>
  PRETTIER_CONCAT(
    PRETTIER_TEXT('{'),
    PRETTIER_NEST(2, PRETTIER_CONCAT(PRETTIER_LINE, ...documents)),
    PRETTIER_LINE,
    PRETTIER_TEXT('}')
  );
