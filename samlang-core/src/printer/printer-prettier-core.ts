/**
 * This module implements the prettier algorithm described in:
 * https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf
 */

/**
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
export const PRETTIER_CONCAT = (...docs: PrettierDocument[]): PrettierDocument => {
  if (docs.length === 0) return PRETTIER_NIL;
  if (docs.length === 1) return docs[0];
  let base: PrettierDocument = {
    __type__: 'CONCAT',
    doc1: docs[docs.length - 2],
    doc2: docs[docs.length - 1],
  };
  for (let i = docs.length - 3; i >= 0; i -= 1) {
    base = PRETTIER_CONCAT(docs[i], base);
  }
  return base;
};

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
 * This is useful when we want the algorithm to choose between two forms to optimically fitting
 * elements into lines with width constraits.
 */
export const PRETTIER_GROUP = (document: PrettierDocument): PrettierDocument =>
  PRETTIER_UNION(flattenPrettierDocument(document), document);

/**
 * Replace all LINE with TEXT(' ').
 * Correspond to the `flatten` function in the prettier paper.
 */
const flattenPrettierDocument = (document: PrettierDocument): PrettierDocument => {
  switch (document.__type__) {
    case 'NIL':
    case 'TEXT':
      return document;
    case 'CONCAT':
      return PRETTIER_CONCAT(
        flattenPrettierDocument(document.doc1),
        flattenPrettierDocument(document.doc2)
      );
    case 'NEST':
      return PRETTIER_NEST(document.indentation, flattenPrettierDocument(document.doc));
    case 'LINE':
      return PRETTIER_TEXT(' ');
    case 'LINE_FLATTEN_TO_NIL':
      return PRETTIER_NIL;
    case 'UNION':
      return flattenPrettierDocument(document.doc1);
  }
};

type PrettierIntermediateDocumentForPrinting =
  | { readonly __type__: 'NIL' }
  | {
      readonly __type__: 'TEXT';
      readonly text: string;
      readonly next: PrettierIntermediateDocumentForPrinting;
    }
  | {
      readonly __type__: 'LINE';
      readonly indentation: number;
      readonly next: PrettierIntermediateDocumentForPrinting;
    };

const intermediateDocumentFitsInAvailableWidth = (
  availableWidth: number,
  document: PrettierIntermediateDocumentForPrinting
): boolean => {
  let remainingWidth = availableWidth;
  let doc = document;
  while (remainingWidth >= 0) {
    // istanbul ignore next
    switch (doc.__type__) {
      case 'NIL':
      case 'LINE':
        return true;
      case 'TEXT':
        remainingWidth -= doc.text.length;
        doc = doc.next;
    }
  }
  return false;
};

type ImmutablePrettierDocumentList =
  | readonly [readonly [number, PrettierDocument], ImmutablePrettierDocumentList]
  | null;

/** Correspond to the be/best function in the prettier paper. */
const generateBestDoc = (
  availableWidth: number,
  consumed: number,
  list: ImmutablePrettierDocumentList
): PrettierIntermediateDocumentForPrinting => {
  if (list === null) return { __type__: 'NIL' };
  const [[indentation, document], rest] = list;
  switch (document.__type__) {
    case 'NIL':
      return generateBestDoc(availableWidth, consumed, rest);
    case 'CONCAT':
      return generateBestDoc(availableWidth, consumed, [
        [indentation, document.doc1],
        [[indentation, document.doc2], rest],
      ]);
    case 'NEST':
      return generateBestDoc(availableWidth, consumed, [
        [indentation + document.indentation, document.doc],
        rest,
      ]);
    case 'TEXT':
      return {
        __type__: 'TEXT',
        text: document.text,
        next: generateBestDoc(availableWidth, consumed + document.text.length, rest),
      };
    case 'LINE':
    case 'LINE_FLATTEN_TO_NIL':
      return {
        __type__: 'LINE',
        indentation,
        next: generateBestDoc(availableWidth, indentation, rest),
      };
    case 'UNION': {
      const choice1 = generateBestDoc(availableWidth, consumed, [
        [indentation, document.doc1],
        rest,
      ]);
      if (intermediateDocumentFitsInAvailableWidth(availableWidth - consumed, choice1)) {
        return choice1;
      }
      return generateBestDoc(availableWidth, consumed, [[indentation, document.doc2], rest]);
    }
  }
};

export const prettyPrintAccordingToPrettierAlgorithm = (
  availableWidth: number,
  document: PrettierDocument
): string => {
  let doc = generateBestDoc(availableWidth, 0, [[0, document], null]);
  const collector: string[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    switch (doc.__type__) {
      case 'NIL': {
        const postProcessed = collector
          .join('')
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n');
        return `${postProcessed}\n`;
      }
      case 'TEXT':
        collector.push(doc.text);
        doc = doc.next;
        break;
      case 'LINE':
        collector.push(`\n${' '.repeat(doc.indentation)}`);
        doc = doc.next;
        break;
    }
  }
};

export const foldPrettierDocument = (
  folder: (document: PrettierDocument, anotherDocument: PrettierDocument) => PrettierDocument,
  documents: readonly PrettierDocument[]
): PrettierDocument => {
  // istanbul ignore next
  if (documents.length === 0) return PRETTIER_NIL;
  // istanbul ignore next
  if (documents.length === 1) return documents[0];
  // TODO: optimize list and destruct.
  // istanbul ignore next
  const [document, ...rest] = documents;
  // istanbul ignore next
  return folder(document, foldPrettierDocument(folder, rest));
};

// istanbul ignore next
const concatDocsWithSpace = (doc1: PrettierDocument, doc2: PrettierDocument): PrettierDocument =>
  PRETTIER_CONCAT(doc1, PRETTIER_TEXT(' '), doc2);
// istanbul ignore next
const concatDocsWithLine = (doc1: PrettierDocument, doc2: PrettierDocument): PrettierDocument =>
  PRETTIER_CONCAT(doc1, PRETTIER_LINE, doc2);

const bracketFlexible = (
  left: string,
  separator: PrettierDocument,
  doc: PrettierDocument,
  right: string
): PrettierDocument =>
  PRETTIER_GROUP(
    PRETTIER_CONCAT(
      PRETTIER_TEXT(left),
      PRETTIER_NEST(2, PRETTIER_CONCAT(separator, doc)),
      separator,
      PRETTIER_TEXT(right)
    )
  );

export const bracketWithoutSpace = (
  left: string,
  doc: PrettierDocument,
  right: string
): PrettierDocument => bracketFlexible(left, PRETTIER_EXTENSION_LINE_FLATTEN_TO_NIL, doc, right);

export const bracketWithSpace = (
  left: string,
  doc: PrettierDocument,
  right: string
): PrettierDocument => bracketFlexible(left, PRETTIER_LINE, doc, right);

export const fill = (documents: readonly PrettierDocument[]): PrettierDocument => {
  // istanbul ignore next
  if (documents.length === 0) return PRETTIER_NIL;
  if (documents.length === 1) return documents[0];
  // TODO: optimize list and destruct.
  const [doc1, doc2, ...rest] = documents;
  return PRETTIER_UNION(
    concatDocsWithSpace(
      flattenPrettierDocument(doc1),
      fill([flattenPrettierDocument(doc2), ...rest])
    ),
    concatDocsWithLine(doc1, fill([doc2, ...rest]))
  );
};
