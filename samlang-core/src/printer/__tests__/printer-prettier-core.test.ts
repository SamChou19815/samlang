import {
  PrettierDocument,
  nil,
  concat,
  nest,
  text,
  line,
  prettyPrintAccordingToPrettierAlgorithm,
  foldDocument,
  group,
  bracket,
  fill,
} from '../printer-prettier-core';

it('tree test', () => {
  type Tree = { readonly name: string; readonly children: readonly Tree[] };

  const showTree = ({ name, children }: Tree): PrettierDocument =>
    group(concat(text(name), nest(name.length, showBracket(children))));

  const showTrees = (trees: readonly Tree[]): PrettierDocument => {
    const [first, ...rest] = trees;
    if (rest.length === 0) return showTree(first);
    return concat(showTree(first), text(','), line, showTrees(rest));
  };

  const showBracket = (trees: readonly Tree[]): PrettierDocument => {
    if (trees.length === 0) return nil;
    return concat(text('['), nest(1, showTrees(trees)), text(']'));
  };

  const showBracket2 = (trees: readonly Tree[]): PrettierDocument => {
    if (trees.length === 0) return nil;
    return bracket('[', showTrees(trees), ']');
  };

  const showTree2 = ({ name, children }: Tree): PrettierDocument =>
    concat(text(name), showBracket2(children));

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
    if (elements.length === 0) return nil;
    return bracket('', fill(elements.map(f).flat()), '');
  };

  const showAttributes = ([name, value]: readonly [
    string,
    string
  ]): readonly PrettierDocument[] => [text(`${name}="${value}"`)];

  const showTag = (name: string, attributes: Readonly<Record<string, string>>): PrettierDocument =>
    concat(text(name), showFill(showAttributes, Object.entries(attributes)));

  const showXMLs = (xml: XML): readonly PrettierDocument[] => {
    switch (xml.type) {
      case 'text':
        return [text(xml.text)];
      case 'element':
        if (xml.children.length === 0) {
          return [concat(text('<'), showTag(xml.name, xml.attributes), text('/>'))];
        }
        return [
          concat(
            text('<'),
            showTag(xml.name, xml.attributes),
            text('>'),
            showFill(showXMLs, xml.children),
            text(`</${xml.name}>`)
          ),
        ];
    }
  };

  const showXML = (xml: XML): PrettierDocument => foldDocument(concat, showXMLs(xml));

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
