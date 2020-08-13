import UnionFind from '../union-find';

it('basic methods test', () => {
  const unionFind = new UnionFind();
  unionFind.getParent(0);
  unionFind.getTreeSize(1);
  unionFind.link(2, 3);
  unionFind.link(1, 3);
  unionFind.link(1, 1);
});

it('disjoint test', () => {
  const unionFind = new UnionFind();
  unionFind.link(1, 2);
  unionFind.link(3, 4);
  expect(unionFind.isLinked(1, 2)).toBeTruthy();
  expect(unionFind.isLinked(2, 1)).toBeTruthy();
  expect(unionFind.isLinked(1, 2)).toBeTruthy();
  expect(unionFind.isLinked(3, 4)).toBeTruthy();
  expect(unionFind.isLinked(4, 3)).toBeTruthy();
  expect(unionFind.isLinked(1, 3)).toBeFalsy();
  expect(unionFind.isLinked(1, 4)).toBeFalsy();
  expect(unionFind.isLinked(3, 1)).toBeFalsy();
  expect(unionFind.isLinked(4, 1)).toBeFalsy();
  expect(unionFind.isLinked(2, 3)).toBeFalsy();
  expect(unionFind.isLinked(2, 4)).toBeFalsy();
  expect(unionFind.isLinked(3, 2)).toBeFalsy();
  expect(unionFind.isLinked(4, 2)).toBeFalsy();
});

it('chain test', () => {
  const unionFind = new UnionFind();
  unionFind.link(1, 2);
  unionFind.link(3, 4);
  unionFind.link(4, 1);
  for (let i = 1; i <= 4; i += 1) {
    for (let j = 1; j <= 4; j += 1) {
      expect(unionFind.isLinked(i, j)).toBeTruthy();
    }
  }
  expect(unionFind.isLinked(1, 5)).toBeFalsy();
  expect(unionFind.isLinked(5, 1)).toBeFalsy();
});

it('stress test', () => {
  const unionFind = new UnionFind();
  for (let i = 0; i < 10000; i += 1) {
    unionFind.link(i, i + 1);
  }
  for (let i = 20000; i < 30000; i += 1) {
    unionFind.link(i, i + 1);
  }
  expect(unionFind.isLinked(0, 10000)).toBeTruthy();
  expect(unionFind.isLinked(20000, 30000)).toBeTruthy();
  expect(unionFind.isLinked(41, 11213)).toBeFalsy();
});
