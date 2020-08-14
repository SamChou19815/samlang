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
  | {
      readonly __type__: 'UNION';
      readonly doc1: PrettierDocument;
      readonly doc2: PrettierDocument;
    };

export const nil: PrettierDocument = { __type__: 'NIL' };

export const concat = (...docs: PrettierDocument[]): PrettierDocument => {
  let base: PrettierDocument = {
    __type__: 'CONCAT',
    doc1: docs[docs.length - 2],
    doc2: docs[docs.length - 1],
  };
  for (let i = docs.length - 3; i >= 0; i -= 1) {
    base = concat(docs[i], base);
  }
  return base;
};

export const nest = (indentation: number, doc: PrettierDocument): PrettierDocument => ({
  __type__: 'NEST',
  indentation,
  doc,
});

export const text = (t: string): PrettierDocument => ({ __type__: 'TEXT', text: t });
export const line: PrettierDocument = { __type__: 'LINE' };
export const union = (doc1: PrettierDocument, doc2: PrettierDocument): PrettierDocument => ({
  __type__: 'UNION',
  doc1,
  doc2,
});

/**
 * Replace all LINE with TEXT(' ').
 * Correspond to the `flatten` function in the prettier paper.
 */
const flattenDocument = (document: PrettierDocument): PrettierDocument => {
  switch (document.__type__) {
    case 'NIL':
    case 'TEXT':
      return document;
    case 'CONCAT':
      return concat(flattenDocument(document.doc1), flattenDocument(document.doc2));
    case 'NEST':
      return nest(document.indentation, flattenDocument(document.doc));
    case 'LINE':
      return text(' ');
    case 'UNION':
      return flattenDocument(document.doc1);
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

const documentFitsInAvailableWidth = (
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

type ImmutableDOCList = readonly [readonly [number, PrettierDocument], ImmutableDOCList] | null;

/** Correspond to the be/best function in the prettier paper. */
const generateBestDoc = (
  availableWidth: number,
  consumed: number,
  list: ImmutableDOCList
): PrettierIntermediateDocumentForPrinting => {
  if (list === null) return { __type__: 'NIL' };
  const [[i, document], rest] = list;
  switch (document.__type__) {
    case 'NIL':
      return generateBestDoc(availableWidth, consumed, rest);
    case 'CONCAT':
      return generateBestDoc(availableWidth, consumed, [
        [i, document.doc1],
        [[i, document.doc2], rest],
      ]);
    case 'NEST':
      return generateBestDoc(availableWidth, consumed, [
        [i + document.indentation, document.doc],
        rest,
      ]);
    case 'TEXT':
      return {
        __type__: 'TEXT',
        text: document.text,
        next: generateBestDoc(availableWidth, consumed + document.text.length, rest),
      };
    case 'LINE':
      return { __type__: 'LINE', indentation: i, next: generateBestDoc(availableWidth, i, rest) };
    case 'UNION': {
      const choice1 = generateBestDoc(availableWidth, consumed, [[i, document.doc1], rest]);
      if (documentFitsInAvailableWidth(availableWidth - consumed, choice1)) return choice1;
      return generateBestDoc(availableWidth, consumed, [[i, document.doc2], rest]);
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
      case 'NIL':
        return collector.join('');
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

export const foldDocument = (
  folder: (document: PrettierDocument, anotherDocument: PrettierDocument) => PrettierDocument,
  documents: readonly PrettierDocument[]
): PrettierDocument => {
  // istanbul ignore next
  if (documents.length === 0) return nil;
  // istanbul ignore next
  if (documents.length === 1) return documents[0];
  // TODO: optimize list and destruct.
  // istanbul ignore next
  const [document, ...rest] = documents;
  // istanbul ignore next
  return folder(document, foldDocument(folder, rest));
};

// istanbul ignore next
const concatDocsWithSpace = (doc1: PrettierDocument, doc2: PrettierDocument): PrettierDocument =>
  concat(doc1, text(' '), doc2);
// istanbul ignore next
const concatDocsWithLine = (doc1: PrettierDocument, doc2: PrettierDocument): PrettierDocument =>
  concat(doc1, line, doc2);

// istanbul ignore next
export const spread = (documents: readonly PrettierDocument[]): PrettierDocument =>
  foldDocument(concatDocsWithSpace, documents);

// istanbul ignore next
export const stack = (documents: readonly PrettierDocument[]): PrettierDocument =>
  foldDocument(concatDocsWithLine, documents);

export const group = (document: PrettierDocument): PrettierDocument =>
  union(flattenDocument(document), document);

export const bracket = (left: string, doc: PrettierDocument, right: string): PrettierDocument =>
  group(concat(text(left), nest(2, concat(line, doc)), line, text(right)));

// istanbul ignore next
export const concatDocsWithSpaceOrLine = (
  doc1: PrettierDocument,
  doc2: PrettierDocument
): PrettierDocument => concat(doc1, union(text(' '), line), doc2);

export const fill = (documents: readonly PrettierDocument[]): PrettierDocument => {
  // istanbul ignore next
  if (documents.length === 0) return nil;
  if (documents.length === 1) return documents[0];
  // TODO: optimize list and destruct.
  const [doc1, doc2, ...rest] = documents;
  return union(
    concatDocsWithSpace(flattenDocument(doc1), fill([flattenDocument(doc2), ...rest])),
    concatDocsWithLine(doc1, fill([doc2, ...rest]))
  );
};
