/**
 * This module implements the prettier algorithm described in:
 * https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf
 */

import { checkNotNull } from '../utils';

/**
 * This prettier document type is a little clumsy at the stage of pretty printing.
 * However, it is very useful for doing optimization on whether to start a new line.
 *
 * Quote:
 * > "... we introduce a new representation for documents, with one constructor corresponding to each
 * operator that builds a document."
 */
export type PrettierDocument =
  | { readonly __type__: 'NIL' }
  | {
      readonly __type__: 'CONCAT';
      readonly doc1: PrettierDocument;
      readonly doc2: PrettierDocument;
    }
  | {
      readonly __type__: 'NEST';
      readonly indentation: number;
      readonly doc: PrettierDocument;
    }
  | { readonly __type__: 'TEXT'; readonly text: string }
  | { readonly __type__: 'LINE' }
  | { readonly __type__: 'LINE_FLATTEN_TO_NIL' }
  | { readonly __type__: 'LINE_HARD' }
  | {
      readonly __type__: 'UNION';
      readonly doc1: PrettierDocument;
      readonly doc2: PrettierDocument;
    };

/** Correspond to the `NIL` node in the prettier paper. It is used as a placeholder. */
export const PRETTIER_NIL: PrettierDocument = { __type__: 'NIL' };

/**
 * Correspond to the `DOC :<> DOC` node in the prettier paper.
 * It connects together tokens and documents.
 */
export function PRETTIER_CONCAT(...docs: PrettierDocument[]): PrettierDocument {
  if (docs.length === 0) return PRETTIER_NIL;
  if (docs.length === 1) return checkNotNull(docs[0]);
  let base: PrettierDocument = {
    __type__: 'CONCAT',
    doc1: checkNotNull(docs[docs.length - 2]),
    doc2: checkNotNull(docs[docs.length - 1]),
  };
  for (let i = docs.length - 3; i >= 0; i -= 1) {
    base = PRETTIER_CONCAT(checkNotNull(docs[i]), base);
  }
  return base;
}

/**
 * Correspond to the `NEST Int DOC` node in the prettier paper.
 * It is the mechanism to introduce extra levels of indentation.
 */
export const PRETTIER_NEST = (indentation: number, doc: PrettierDocument): PrettierDocument => ({
  __type__: 'NEST',
  indentation,
  doc,
});

/**
 * Correspond to the `TEXT String` node in the prettier paper.
 * It is the leaf node that won't be further break down.
 */
export const PRETTIER_TEXT = (t: string): PrettierDocument => ({ __type__: 'TEXT', text: t });

/** Correspond to the `LINE` node in the prettier paper. It is used to introduce a new line. */
export const PRETTIER_LINE: PrettierDocument = { __type__: 'LINE' };

/**
 * Sam's extension to prettier's document.
 * It behaves exactly like `LINE`, except that it is flattened to nil instead of a space.
 */
export const PRETTIER_EXTENSION_LINE_FLATTEN_TO_NIL: PrettierDocument = {
  __type__: 'LINE_FLATTEN_TO_NIL',
};

/**
 * Sam's extension to prettier's document.
 * It behaves like `LINE`, except that it must always be a line.
 */
export const PRETTIER_EXTENSION_LINE_HARD: PrettierDocument = { __type__: 'LINE_HARD' };

/**
 * Correspond to the `DOC :<|> DOC` node in the prettier paper.
 * It represents two different ways to print the document, where `doc1` is preferred over `doc2`.
 * In general, `doc1` is the flattened version of `doc2`.
 */
const PRETTIER_UNION = (doc1: PrettierDocument, doc2: PrettierDocument): PrettierDocument => ({
  __type__: 'UNION',
  doc1,
  doc2,
});

/**
 * Given a `document`, returns the union of flattened document and its original form.
 *
 * Correspond to the `group` function in the prettier paper.
 *
 * This is useful when we want the algorithm to choose between two forms to optimally fitting
 * elements into lines with width constraits.
 */
export function PRETTIER_GROUP(document: PrettierDocument): PrettierDocument {
  const flattened = flattenPrettierDocument(document);
  return flattened != null ? PRETTIER_UNION(flattened, document) : document;
}

function bracketFlexible(
  left: string,
  separator: PrettierDocument,
  doc: PrettierDocument,
  right: string
): PrettierDocument {
  return PRETTIER_GROUP(
    PRETTIER_CONCAT(
      PRETTIER_TEXT(left),
      PRETTIER_NEST(2, PRETTIER_CONCAT(separator, doc)),
      separator,
      PRETTIER_TEXT(right)
    )
  );
}

/**
 * Correspond to the bracket function in the prettier paper,
 * but using `LINE_FLATTEN_TO_NIL` as separator.
 */
export const PRETTIER_NO_SPACE_BRACKET = (
  left: string,
  doc: PrettierDocument,
  right: string
): PrettierDocument => bracketFlexible(left, PRETTIER_EXTENSION_LINE_FLATTEN_TO_NIL, doc, right);

/** Correspond to the bracket function in the prettier paper. */
export const PRETTIER_SPACED_BRACKET = (
  left: string,
  doc: PrettierDocument,
  right: string
): PrettierDocument => bracketFlexible(left, PRETTIER_LINE, doc, right);

export function PRETTIER_LINE_COMMENT(text: string): PrettierDocument {
  const words = text.split(' ');
  const singleLineForm = PRETTIER_TEXT(`// ${text}`);
  const multipleLineForm = PRETTIER_CONCAT(
    PRETTIER_TEXT('// '),
    ...words.map((word) =>
      PRETTIER_UNION(
        PRETTIER_TEXT(`${word} `),
        PRETTIER_CONCAT(PRETTIER_TEXT(word), PRETTIER_EXTENSION_LINE_HARD, PRETTIER_TEXT('// '))
      )
    )
  );
  return PRETTIER_UNION(singleLineForm, multipleLineForm);
}

export function PRETTIER_MULTILINE_COMMENT(starter: string, text: string): PrettierDocument {
  const words = text.split(' ');
  const singleLineForm = PRETTIER_TEXT(`${starter} ${text} */`);
  const multipleLineForm = PRETTIER_CONCAT(
    PRETTIER_TEXT(starter),
    PRETTIER_EXTENSION_LINE_HARD,
    PRETTIER_TEXT(' * '),
    ...words.map((word) =>
      PRETTIER_UNION(
        PRETTIER_TEXT(`${word} `),
        PRETTIER_CONCAT(PRETTIER_TEXT(word), PRETTIER_EXTENSION_LINE_HARD, PRETTIER_TEXT(' * '))
      )
    ),
    PRETTIER_EXTENSION_LINE_HARD,
    PRETTIER_TEXT(' */')
  );
  return PRETTIER_UNION(singleLineForm, multipleLineForm);
}

/**
 * Replace all LINE with TEXT(' ').
 * Correspond to the `flatten` function in the prettier paper.
 */
function flattenPrettierDocument(document: PrettierDocument): PrettierDocument | null {
  switch (document.__type__) {
    case 'NIL':
    case 'TEXT':
      return document;
    case 'CONCAT': {
      const doc1 = flattenPrettierDocument(document.doc1);
      const doc2 = flattenPrettierDocument(document.doc2);
      if (doc1 == null || doc2 == null) return null;
      return PRETTIER_CONCAT(doc1, doc2);
    }
    case 'NEST': {
      const doc = flattenPrettierDocument(document.doc);
      return doc != null ? PRETTIER_NEST(document.indentation, doc) : null;
    }
    case 'LINE':
      return PRETTIER_TEXT(' ');
    case 'LINE_FLATTEN_TO_NIL':
      return PRETTIER_NIL;
    case 'LINE_HARD':
      return null;
    case 'UNION':
      return flattenPrettierDocument(document.doc1);
  }
}

/**
 * The representation of a document that is most useful for pretty-printing.
 * Each variant can be translated easily into a printable form without extra state.
 */
type PrettierIntermediateDocumentTokenForPrinting =
  | { readonly __type__: 'TEXT'; readonly text: string }
  | { readonly __type__: 'LINE'; readonly indentation: number };

type ImmutableList<T> = readonly [T, ImmutableList<T>] | null;
type ImmutablePrettierDocumentList = ImmutableList<readonly [number, PrettierDocument]>;
type ImmutableIntermediateDocumentList =
  ImmutableList<PrettierIntermediateDocumentTokenForPrinting>;

function intermediateDocumentFitsInAvailableWidth(
  availableWidth: number,
  documents: ImmutableIntermediateDocumentList
): boolean {
  let remainingWidth = availableWidth;
  let docList = documents;
  while (remainingWidth >= 0) {
    if (docList == null) return true;
    const [doc, rest] = docList;
    if (doc.__type__ === 'LINE') return true;
    remainingWidth -= doc.text.length;
    docList = rest;
  }
  return false;
}

function getMemoized2ArgFunction<A, B, R>(f: (a: A, b: B) => R): (a: A, b: B) => R {
  const memoizedResultMap = new Map<A, Map<B, R>>();

  function memoized(a: A, b: B): R {
    let level1Map = memoizedResultMap.get(a);
    if (level1Map == null) {
      level1Map = new Map();
      memoizedResultMap.set(a, level1Map);
    }
    const resultCache = level1Map.get(b);
    if (resultCache != null) return resultCache;
    const result = f(a, b);
    level1Map.set(b, result);
    return result;
  }

  return memoized;
}

const createImmutablePrettierDocumentListItem = getMemoized2ArgFunction(
  (indentation: number, doc: PrettierDocument): readonly [number, PrettierDocument] => [
    indentation,
    doc,
  ]
);
const createImmutablePrettierDocumentList = getMemoized2ArgFunction(
  (
    item: readonly [number, PrettierDocument],
    list: ImmutablePrettierDocumentList
  ): ImmutablePrettierDocumentList => [item, list]
);

/**
 * This function inspects the number of available remaining width in a line, and try to produce
 * a flattened document as much as it can.
 *
 * Correspond to the be/best function in the prettier paper.
 */
function generateBestDoc(availableWidth: number) {
  const generateMemoized = getMemoized2ArgFunction(
    (consumed: number, list: ImmutablePrettierDocumentList): ImmutableIntermediateDocumentList => {
      if (list == null) return null;
      const [[indentation, document], rest] = list;
      switch (document.__type__) {
        case 'NIL':
          return generateMemoized(consumed, rest);
        case 'CONCAT':
          return generateMemoized(
            consumed,
            createImmutablePrettierDocumentList(
              createImmutablePrettierDocumentListItem(indentation, document.doc1),
              createImmutablePrettierDocumentList(
                createImmutablePrettierDocumentListItem(indentation, document.doc2),
                rest
              )
            )
          );
        case 'NEST':
          return generateMemoized(
            consumed,
            createImmutablePrettierDocumentList(
              createImmutablePrettierDocumentListItem(
                indentation + document.indentation,
                document.doc
              ),
              rest
            )
          );
        case 'TEXT':
          return [
            { __type__: 'TEXT', text: document.text },
            generateMemoized(consumed + document.text.length, rest),
          ];
        case 'LINE':
        case 'LINE_FLATTEN_TO_NIL':
        case 'LINE_HARD':
          return [{ __type__: 'LINE', indentation }, generateMemoized(indentation, rest)];
        case 'UNION': {
          const choice1 = generateMemoized(
            consumed,
            createImmutablePrettierDocumentList(
              createImmutablePrettierDocumentListItem(indentation, document.doc1),
              rest
            )
          );
          if (intermediateDocumentFitsInAvailableWidth(availableWidth - consumed, choice1)) {
            return choice1;
          } else {
            return generateMemoized(
              consumed,
              createImmutablePrettierDocumentList(
                createImmutablePrettierDocumentListItem(indentation, document.doc2),
                rest
              )
            );
          }
        }
      }
    }
  );
  return generateMemoized;
}

export function prettyPrintAccordingToPrettierAlgorithm(
  availableWidth: number,
  document: PrettierDocument
): string {
  let documents = generateBestDoc(availableWidth)(0, [[0, document], null]);
  const collector: string[] = [];

  while (documents != null) {
    const [doc, rest] = documents;
    documents = rest;
    switch (doc.__type__) {
      case 'TEXT':
        collector.push(doc.text);
        break;
      case 'LINE':
        collector.push(`\n${' '.repeat(doc.indentation)}`);
        break;
    }
  }
  const postProcessed = collector
    .join('')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  return `${postProcessed}\n`;
}
