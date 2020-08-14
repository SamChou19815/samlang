/**
 * This module implements the prettier algorithm described in:
 * https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf
 */

// TODO: wait to be tested.

type Doc =
  | { readonly __type__: 'NIL' }
  | { readonly __type__: 'TEXT'; readonly text: string; readonly next: Doc }
  | {
      readonly __type__: 'LINE';
      readonly indentation: number;
      readonly next: Doc;
    };

/**
 * Quote:
 * > "... we introduce a new representation for documents, with one constructor corresponding to each
 * operator that builds a document."
 */
type DOC =
  | { readonly __type__: 'NIL' }
  | {
      readonly __type__: 'CONCAT';
      readonly doc1: DOC;
      readonly doc2: DOC;
    }
  | {
      readonly __type__: 'NEST';
      readonly indentation: number;
      readonly doc: DOC;
    }
  | { readonly __type__: 'TEXT'; readonly text: string }
  | { readonly __type__: 'LINE' }
  | {
      readonly __type__: 'UNION';
      readonly doc1: DOC;
      readonly doc2: DOC;
    };

const nil: DOC = { __type__: 'NIL' };
const nest = (indentation: number, doc: DOC): DOC => ({ __type__: 'NEST', indentation, doc });
const text = (t: string): DOC => ({ __type__: 'TEXT', text: t });
const line: DOC = { __type__: 'LINE' };
const union = (doc1: DOC, doc2: DOC): DOC => ({ __type__: 'UNION', doc1, doc2 });

const concat = (...docs: DOC[]): DOC => {
  let base: DOC = { __type__: 'CONCAT', doc1: docs[docs.length - 2], doc2: docs[docs.length - 1] };
  for (let i = docs.length - 3; i > 0; i -= 1) {
    base = concat(docs[i], base);
  }
  return base;
};

const flatten = (document: DOC): DOC => {
  switch (document.__type__) {
    case 'NIL':
    case 'TEXT':
      return document;
    case 'CONCAT':
      return union(flatten(document.doc1), flatten(document.doc2));
    case 'NEST':
      return nest(document.indentation, flatten(document.doc));
    case 'LINE':
      return text(' ');
    case 'UNION':
      return flatten(document.doc1);
  }
};

// TODO: optimize string concat here!
const layout = (document: Doc): string => {
  switch (document.__type__) {
    case 'NIL':
      return '';
    case 'TEXT':
      return document.text + layout(document.next);
    case 'LINE':
      return `\n${' '.repeat(document.indentation)}${layout(document.next)}`;
  }
};

const fits = (availableWidth: number, document: Doc): boolean => {
  if (availableWidth < 0) return false;
  switch (document.__type__) {
    case 'NIL':
      return true;
    case 'TEXT':
      return fits(availableWidth - document.text.length, document.next);
    case 'LINE':
      return true;
  }
};

const better = (
  availableWidth: number,
  consumed: number,
  documentChoice1: Doc,
  documentChoice2: Doc
): Doc => (fits(availableWidth - consumed, documentChoice1) ? documentChoice1 : documentChoice2);

const be = (
  availableWidth: number,
  consumed: number,
  list: readonly (readonly [number, DOC])[]
): Doc => {
  if (list.length === 0) return { __type__: 'NIL' };
  // TODO: optimize list concat and destruct.
  const [[i, document], ...rest] = list;
  switch (document.__type__) {
    case 'NIL':
      return be(availableWidth, consumed, rest);
    case 'CONCAT':
      return be(availableWidth, consumed, [[i, document.doc1], [i, document.doc2], ...rest]);
    case 'NEST':
      return be(availableWidth, consumed, [[i + document.indentation, document.doc], ...rest]);
    case 'TEXT':
      return {
        __type__: 'TEXT',
        text: document.text,
        next: be(availableWidth, consumed + document.text.length, rest),
      };
    case 'LINE':
      return { __type__: 'LINE', indentation: i, next: be(availableWidth, i, rest) };
    case 'UNION':
      return better(
        availableWidth,
        consumed,
        be(availableWidth, consumed, [[i, document.doc1], ...rest]),
        be(availableWidth, consumed, [[i, document.doc2], ...rest])
      );
  }
};

const best = (availableWidth: number, consumed: number, document: DOC): Doc =>
  be(availableWidth, consumed, [[0, document]]);

export const pretty = (availableWidth: number, document: DOC): string =>
  layout(best(availableWidth, 0, document));

const foldDocument = (
  folder: (document: DOC, anotherDocument: DOC) => DOC,
  documents: readonly DOC[]
): DOC => {
  if (documents.length === 0) return nil;
  if (documents.length === 1) return documents[0];
  // TODO: optimize list and destruct.
  const [document, ...rest] = documents;
  return folder(document, foldDocument(folder, rest));
};

const concatDocsWithSpace = (doc1: DOC, doc2: DOC): DOC => concat(doc1, text(' '), doc2);
const concatDocsWithLine = (doc1: DOC, doc2: DOC): DOC => concat(doc1, line, doc2);

export const spread = (documents: readonly DOC[]): DOC =>
  foldDocument(concatDocsWithSpace, documents);
export const stack = (documents: readonly DOC[]): DOC =>
  foldDocument(concatDocsWithLine, documents);

const group = (document: DOC): DOC => union(flatten(document), document);

export const bracket = (left: string, doc: DOC, right: string): DOC =>
  group(concat(text(left), nest(2, concat(line, doc)), line, text(right)));

export const concatDocsWithSpaceOrLine = (doc1: DOC, doc2: DOC): DOC =>
  concat(doc1, union(text(' '), line), doc2);

export const fill = (documents: readonly DOC[]): DOC => {
  if (documents.length === 0) return nil;
  if (documents.length === 1) return documents[0];
  // TODO: optimize list and destruct.
  const [doc1, doc2, ...rest] = documents;
  return union(
    concatDocsWithSpace(flatten(doc1), fill([flatten(doc2), ...rest])),
    concatDocsWithLine(doc1, fill([doc2, ...rest]))
  );
};
