import { collectCommentsForParser, findRelevantDocComment } from '../parser-comment-collector';

import { Position, Range } from 'samlang-core-ast/common-nodes';

it('collectCommentsForParser works', () => {
  expect(
    collectCommentsForParser(`
  /** doc class */
  class Main {
    /*
     * doc func
     * ahhhh
     */
    function main(): unit =
      println("HW") // comment stmt
  }
  `).map((it) => ({ ...it, range: it.range.toString() }))
  ).toEqual([
    { commentType: 'doc', commentText: 'doc class', range: '2:3-2:19' },
    { commentType: 'block', commentText: 'doc func ahhhh', range: '4:5-4:44' },
    { commentType: 'line', commentText: 'comment stmt', range: '9:21-9:37' },
  ]);
});

it('findRelevantDocComment works', () => {
  expect(findRelevantDocComment([], Range.DUMMY)).toBeNull();

  expect(
    findRelevantDocComment(
      [
        {
          commentType: 'line',
          commentText: '',
          range: new Range(new Position(1, 2), new Position(2, 3)),
        },
      ],
      new Range(new Position(1, 1), new Position(3, 3))
    )
  ).toBeNull();

  expect(
    findRelevantDocComment(
      [
        {
          commentType: 'doc',
          commentText: 't1',
          range: new Range(new Position(1, 2), new Position(2, 3)),
        },
      ],
      new Range(new Position(1, 1), new Position(3, 3))
    )
  ).toBe('t1');
});
