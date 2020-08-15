import {
  PrettierDocument,
  PRETTIER_NIL,
  PRETTIER_CONCAT,
  PRETTIER_TEXT,
  PRETTIER_LINE,
  PRETTIER_NO_SPACE_BRACKET,
  prettyPrintAccordingToPrettierAlgorithm,
} from '../printer-prettier-core';

it('prettier concat constructor test', () => {
  expect(PRETTIER_CONCAT()).toEqual(PRETTIER_NIL);
  expect(PRETTIER_CONCAT(PRETTIER_TEXT('a'))).toEqual(PRETTIER_TEXT('a'));
  expect(PRETTIER_CONCAT(PRETTIER_TEXT('a'))).toEqual(PRETTIER_TEXT('a'));
  expect(PRETTIER_CONCAT(PRETTIER_TEXT('a'), PRETTIER_TEXT('b'), PRETTIER_TEXT('c'))).toEqual(
    PRETTIER_CONCAT(PRETTIER_TEXT('a'), PRETTIER_CONCAT(PRETTIER_TEXT('b'), PRETTIER_TEXT('c')))
  );
});

it('prettier-core tree test', () => {
  type Tree = { readonly name: string; readonly children: readonly Tree[] };

  const showTrees = (trees: readonly Tree[]): PrettierDocument => {
    const [first, ...rest] = trees;
    if (rest.length === 0) return showTree(first);
    return PRETTIER_CONCAT(showTree(first), PRETTIER_TEXT(','), PRETTIER_LINE, showTrees(rest));
  };

  const showBracket = (trees: readonly Tree[]): PrettierDocument => {
    if (trees.length === 0) return PRETTIER_NIL;
    return PRETTIER_NO_SPACE_BRACKET('[', showTrees(trees), ']');
  };

  const showTree = ({ name, children }: Tree): PrettierDocument =>
    PRETTIER_CONCAT(PRETTIER_TEXT(name), showBracket(children));

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

  expect(prettyPrintAccordingToPrettierAlgorithm(20, showTree(exampleTree))).toBe(`aaa[
  bbbbb[ccc, dd],
  eee,
  ffff[gg, hhh, ii]
]
`);

  expect(prettyPrintAccordingToPrettierAlgorithm(16, showTree(exampleTree))).toBe(`aaa[
  bbbbb[
    ccc,
    dd
  ],
  eee,
  ffff[
    gg,
    hhh,
    ii
  ]
]
`);
});
