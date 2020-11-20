import {
  MIN_I32_VALUE,
  MAX_I32_VALUE,
  bigIntIsWithin32BitIntegerRange,
  logTwo,
  isPowerOfTwo,
  isNotNull,
  assertNotNull,
  checkNotNull,
  Hashable,
  mapOf,
  setOf,
  hashMapOf,
  hashSetOf,
  listShallowEquals,
  mapEquals,
  hashMapEquals,
  setEquals,
  UnionFind,
} from '..';

it('bigIntIsWithin32BitIntegerRange test', () => {
  expect(bigIntIsWithin32BitIntegerRange(BigInt(-21474836480))).toBeFalsy();
  expect(bigIntIsWithin32BitIntegerRange(MIN_I32_VALUE)).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(BigInt(0))).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(MAX_I32_VALUE)).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(BigInt(21474836470))).toBeFalsy();
});

it('logTwo, isPowerOfTwo test', () => {
  expect(isPowerOfTwo(BigInt(0))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(1))).toBeTruthy();
  expect(isPowerOfTwo(BigInt(2))).toBeTruthy();
  expect(isPowerOfTwo(BigInt(3))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(4))).toBeTruthy();
  expect(isPowerOfTwo(BigInt(5))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(6))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(7))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(8))).toBeTruthy();

  expect(logTwo(BigInt(1))).toBe(0);
  expect(logTwo(BigInt(2))).toBe(1);
  expect(logTwo(BigInt(4))).toBe(2);
  expect(logTwo(BigInt(8))).toBe(3);
  expect(logTwo(BigInt(16))).toBe(4);
  expect(logTwo(BigInt(65536))).toBe(16);
});

it('isNotNull tests', () => {
  expect(isNotNull(2)).toBeTruthy();
  expect(isNotNull('2')).toBeTruthy();
  expect(isNotNull([3])).toBeTruthy();
  expect(isNotNull(null)).toBeFalsy();
  expect(isNotNull(undefined)).toBeFalsy();
});

it('assertNotNull tests', () => {
  assertNotNull(2);
  assertNotNull('2');
  assertNotNull([3]);
  expect(() => assertNotNull(null)).toThrow();
  expect(() => assertNotNull(undefined)).toThrow();
});

it('checkNotNull tests', () => {
  expect(checkNotNull(2)).toBe(2);
});

it('ReadOnly map and set tests', () => {
  expect(mapOf().size).toBe(0);
  expect(setOf().size).toBe(0);
  expect(
    mapOf([{ uniqueHash: () => 3 }, 3], [{ uniqueHash: () => 4 }, 4], [{ uniqueHash: () => 3 }, 4])
      .size
  ).toBe(2);
  expect(
    setOf({ uniqueHash: () => 3 }, { uniqueHash: () => 4 }, { uniqueHash: () => 3 }).size
  ).toBe(2);
});

class HashableClass implements Hashable {
  constructor(public readonly n: number) {}

  uniqueHash = (): number => this.n;
}

const N = (n: number): HashableClass => new HashableClass(n);

it('map tests', () => {
  const map = hashMapOf([N(1), 1], [N(2), 2]);

  map.forEach(() => {});

  expect(map.get(N(1))).toBe(1);
  expect(map.get(N(2))).toBe(2);
  expect(map.get(N(3))).toBeUndefined();
  expect(map.has(N(1))).toBeTruthy();
  expect(map.has(N(2))).toBeTruthy();
  expect(map.has(N(3))).toBeFalsy();
  expect(map.size).toBe(2);

  map.set(N(1), 3);
  expect(map.get(N(1))).toBe(3);
  expect(map.get(N(2))).toBe(2);
  expect(map.get(N(3))).toBeUndefined();
  expect(map.has(N(1))).toBeTruthy();
  expect(map.has(N(2))).toBeTruthy();
  expect(map.has(N(3))).toBeFalsy();
  expect(map.size).toBe(2);

  map.delete(N(1));
  expect(map.get(N(1))).toBeUndefined();
  expect(map.get(N(2))).toBe(2);
  expect(map.get(N(3))).toBeUndefined();
  expect(map.has(N(1))).toBeFalsy();
  expect(map.has(N(2))).toBeTruthy();
  expect(map.has(N(3))).toBeFalsy();
  expect(map.size).toBe(1);

  map.clear();
  expect(map.get(N(1))).toBeUndefined();
  expect(map.get(N(2))).toBeUndefined();
  expect(map.get(N(3))).toBeUndefined();
  expect(map.has(N(1))).toBeFalsy();
  expect(map.has(N(2))).toBeFalsy();
  expect(map.has(N(3))).toBeFalsy();
  expect(map.size).toBe(0);
  map.forEach(() => {
    throw new Error();
  });
});

it('set tests', () => {
  const set = hashSetOf(N(1), N(2));

  set.forEach(() => {});

  expect(set.has(N(1))).toBeTruthy();
  expect(set.has(N(2))).toBeTruthy();
  expect(set.has(N(3))).toBeFalsy();
  expect(set.size).toBe(2);

  set.add(N(1));
  expect(set.has(N(1))).toBeTruthy();
  expect(set.has(N(2))).toBeTruthy();
  expect(set.has(N(3))).toBeFalsy();
  expect(set.size).toBe(2);

  set.delete(N(1));
  expect(set.has(N(1))).toBeFalsy();
  expect(set.has(N(2))).toBeTruthy();
  expect(set.has(N(3))).toBeFalsy();
  expect(set.size).toBe(1);

  set.clear();
  expect(set.has(N(1))).toBeFalsy();
  expect(set.has(N(2))).toBeFalsy();
  expect(set.has(N(3))).toBeFalsy();
  expect(set.size).toBe(0);
  set.forEach(() => {
    throw new Error();
  });
});

it('listShallowEquals tests', () => {
  expect(listShallowEquals([], [])).toBeTruthy();
  expect(listShallowEquals(['a'], ['a'])).toBeTruthy();
  expect(listShallowEquals(['a', 3], ['a', 3])).toBeTruthy();
  expect(listShallowEquals(['a', 3], ['a', 2])).toBeFalsy();
  expect(listShallowEquals(['a', 3], ['a'])).toBeFalsy();
  expect(listShallowEquals(['a', 3], [])).toBeFalsy();
});

it('mapEquals tests', () => {
  expect(mapEquals(new Map(), new Map([['1', 1]]))).toBeFalsy();
  expect(mapEquals(new Map([['2', 1]]), new Map([['1', 1]]))).toBeFalsy();
  expect(mapEquals(new Map([['1', 1]]), new Map([['1', 1]]))).toBeTruthy();
});

it('hashMapEquals tests', () => {
  expect(hashMapEquals(hashMapOf<HashableClass, number>(), hashMapOf([N(1), 1]))).toBeFalsy();
  expect(hashMapEquals(hashMapOf([N(2), 1]), hashMapOf([N(1), 1]))).toBeFalsy();
  expect(hashMapEquals(hashMapOf([N(1), 1]), hashMapOf([N(1), 1]))).toBeTruthy();
});

it('setEquals tests', () => {
  expect(setEquals(new Set(), new Set([1]))).toBeFalsy();
  expect(setEquals(new Set([2]), new Set([1]))).toBeFalsy();
  expect(setEquals(new Set([1]), new Set([1]))).toBeTruthy();
});

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
