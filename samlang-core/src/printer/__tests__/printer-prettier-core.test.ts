import {
  PrettierDocument,
  PRETTIER_NIL,
  PRETTIER_CONCAT,
  PRETTIER_NEST,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  prettyPrintAccordingToPrettierAlgorithm,
  foldPrettierDocument,
  group,
  bracket,
  fill,
} from '../printer-prettier-core';

it('tree test', () => {
  type Tree = { readonly name: string; readonly children: readonly Tree[] };

  const showTree = ({ name, children }: Tree): PrettierDocument =>
    group(PRETTIER_CONCAT(PRETTIER_TEXT(name), PRETTIER_NEST(name.length, showBracket(children))));

  const showTrees = (trees: readonly Tree[]): PrettierDocument => {
    const [first, ...rest] = trees;
    if (rest.length === 0) return showTree(first);
    return PRETTIER_CONCAT(showTree(first), PRETTIER_TEXT(','), PRETTIER_LINE, showTrees(rest));
  };

  const showBracket = (trees: readonly Tree[]): PrettierDocument => {
    if (trees.length === 0) return PRETTIER_NIL;
    return PRETTIER_CONCAT(
      PRETTIER_TEXT('['),
      PRETTIER_NEST(1, showTrees(trees)),
      PRETTIER_TEXT(']')
    );
  };

  const showBracket2 = (trees: readonly Tree[]): PrettierDocument => {
    if (trees.length === 0) return PRETTIER_NIL;
    return bracket('[', showTrees(trees), ']');
  };

  const showTree2 = ({ name, children }: Tree): PrettierDocument =>
    PRETTIER_CONCAT(PRETTIER_TEXT(name), showBracket2(children));

  const exampleTree: Tree = {
    name: 'aaa',
    children: [
      {
        name: 'bbbbb',
        children: [
          { name: 'ccc', children: [] },
          { name: 'dd', children: [] },
        ],
      },
      { name: 'eee', children: [] },
      {
        name: 'ffff',
        children: [
          { name: 'gg', children: [] },
          { name: 'hhh', children: [] },
          { name: 'ii', children: [] },
        ],
      },
    ],
  };

  expect(prettyPrintAccordingToPrettierAlgorithm(20, showTree2(exampleTree))).toBe(`aaa[
  bbbbb[ccc, dd],
  eee,
  ffff[gg, hhh, ii]
]`);

  expect(prettyPrintAccordingToPrettierAlgorithm(16, showTree2(exampleTree))).toBe(`aaa[
  bbbbb[ccc,
        dd],
  eee,
  ffff[gg,
       hhh,
       ii]
]`);
});

it('xml test', () => {
  type XML =
    | {
        readonly type: 'element';
        readonly name: string;
        readonly attributes: Readonly<Record<string, string>>;
        children: readonly XML[];
      }
    | { readonly type: 'text'; readonly text: string };

  const showFill = <E>(
    f: (element: E) => readonly PrettierDocument[],
    elements: readonly E[]
  ): PrettierDocument => {
    if (elements.length === 0) return PRETTIER_NIL;
    return bracket('', fill(elements.map(f).flat()), '');
  };

  const showAttributes = ([name, value]: readonly [
    string,
    string
  ]): readonly PrettierDocument[] => [PRETTIER_TEXT(`${name}="${value}"`)];

  const showTag = (name: string, attributes: Readonly<Record<string, string>>): PrettierDocument =>
    PRETTIER_CONCAT(PRETTIER_TEXT(name), showFill(showAttributes, Object.entries(attributes)));

  const showXMLs = (xml: XML): readonly PrettierDocument[] => {
    switch (xml.type) {
      case 'text':
        return [PRETTIER_TEXT(xml.text)];
      case 'element':
        if (xml.children.length === 0) {
          return [
            PRETTIER_CONCAT(
              PRETTIER_TEXT('<'),
              showTag(xml.name, xml.attributes),
              PRETTIER_TEXT('/>')
            ),
          ];
        }
        return [
          PRETTIER_CONCAT(
            PRETTIER_TEXT('<'),
            showTag(xml.name, xml.attributes),
            PRETTIER_TEXT('>'),
            showFill(showXMLs, xml.children),
            PRETTIER_TEXT(`</${xml.name}>`)
          ),
        ];
    }
  };

  const showXML = (xml: XML): PrettierDocument =>
    foldPrettierDocument(PRETTIER_CONCAT, showXMLs(xml));

  const exampleXML: XML = {
    type: 'element',
    name: 'p',
    attributes: { color: 'red', front: 'Times', size: '10' },
    children: [
      { type: 'text', text: 'Here is some' },
      {
        type: 'element',
        name: 'em',
        attributes: {},
        children: [{ type: 'text', text: 'emphasized' }],
      },
      { type: 'text', text: 'text.' },
      { type: 'text', text: 'Here is a' },
      {
        type: 'element',
        name: 'a',
        attributes: { href: 'https://developersam.com' },
        children: [{ type: 'text', text: 'link' }],
      },
      { type: 'text', text: 'elsewhere.' },
    ],
  };

  expect(prettyPrintAccordingToPrettierAlgorithm(60, showXML(exampleXML)))
    .toBe(`<p color="red" front="Times" size="10" >
  Here is some <em> emphasized </em> text. Here is a
  <a href="https://developersam.com" > link </a> elsewhere.
</p>`);

  expect(prettyPrintAccordingToPrettierAlgorithm(30, showXML(exampleXML))).toBe(`<p
  color="red" front="Times"
  size="10"
>
  Here is some
  <em> emphasized </em> text.
  Here is a
  <a
    href="https://developersam.com"
  > link </a>
  elsewhere.
</p>`);

  expect(prettyPrintAccordingToPrettierAlgorithm(20, showXML(exampleXML))).toBe(`<p
  color="red"
  front="Times"
  size="10"
>
  Here is some
  <em>
    emphasized
  </em>
  text. Here is a
  <a
    href="https://developersam.com"
  > link </a>
  elsewhere.
</p>`);
});
