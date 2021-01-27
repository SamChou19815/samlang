import collectCommentsForParser from '../parser-comment-collector';

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
