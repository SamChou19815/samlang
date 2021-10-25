import {
  intArrayToDataString,
  error,
  isNotNull,
  checkNotNull,
  ignore,
  assert,
  zip,
  zip3,
  filterMap,
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
  LocalStackedContext,
} from '../utils';

describe('samlang-utils', () => {
  it('intArrayToDataString test', () => {
    expect(intArrayToDataString([1, 2, 3, 4])).toBe(
      '\\01\\00\\00\\00\\02\\00\\00\\00\\03\\00\\00\\00\\04\\00\\00\\00'
    );
    expect(intArrayToDataString([1, 124, 4531, 33])).toBe(
      '\\01\\00\\00\\00\\7c\\00\\00\\00\\b3\\11\\00\\00\\21\\00\\00\\00'
    );
  });

  it('error test', () => {
    expect(error).toThrow();
  });

  it('isNotNull tests', () => {
    expect(isNotNull(2)).toBeTruthy();
    expect(isNotNull('2')).toBeTruthy();
    expect(isNotNull([3])).toBeTruthy();
    expect(isNotNull(null)).toBeFalsy();
    expect(isNotNull(undefined)).toBeFalsy();
  });

  it('checkNotNull tests', () => {
    expect(checkNotNull(2)).toBe(2);
    expect(() => checkNotNull(null)).toThrow();
    expect(() => checkNotNull(null, '')).toThrow();
  });

  it('ignore test', () => {
    expect(ignore()).toBeUndefined();
  });

  it('assert test', () => {
    assert(true);
    expect(() => assert(false)).toThrow();
  });

  it('zip test', () => {
    expect(zip([1, 2], ['1', '2'])).toEqual([
      [1, '1'],
      [2, '2'],
    ]);
    expect(zip3([1, 2], ['1', '2'], ['a', 'b'])).toEqual([
      [1, '1', 'a'],
      [2, '2', 'b'],
    ]);
  });

  it('filterMap test', () => {
    expect(filterMap([1, 2, 3], (n) => (n % 2 === 1 ? n * 2 : null))).toEqual([2, 6]);
  });

  it('ReadOnly map and set tests', () => {
    expect(mapOf().size).toBe(0);
    expect(setOf().size).toBe(0);
    expect(
      mapOf(
        [{ uniqueHash: () => 3 }, 3],
        [{ uniqueHash: () => 4 }, 4],
        [{ uniqueHash: () => 3 }, 4]
      ).size
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

  it('LocalStackedContext basic methods test.', () => {
    const context = new LocalStackedContext<number>();
    expect(context.getLocalValueType('b')).toBeUndefined();
    context.addLocalValueType('a', 3, error);
    expect(context.getLocalValueType('a')).toBe(3);
    context.removeLocalValue('a');
    expect(() => context.removeLocalValue('a')).toThrow();
    context.withNestedScope(() => {});
  });

  it('LocalStackedContext can find conflicts.', () => {
    const context = new LocalStackedContext();
    context.addLocalValueType('a', 3, error);
    let hasConflict = false;
    context.addLocalValueType('a', 3, () => {
      hasConflict = true;
    });
    expect(hasConflict).toBe(true);
  });

  it('LocalStackedContext can compute local values.', () => {
    const context = new LocalStackedContext();
    context.addLocalValueType('a', 3, error);
    context.addLocalValueType('b', 3, error);
    const [, local] = context.withNestedScopeReturnScoped(() => {
      context.addLocalValueType('c', 3, error);
      context.addLocalValueType('d', 3, error);
    });
    expect(Array.from(local.keys())).toEqual(['c', 'd']);
  });

  it('LocalStackedContext can compute captured values.', () => {
    const context = new LocalStackedContext();
    context.addLocalValueType('a', 3, error);
    context.addLocalValueType('b', 3, error);
    const [, capturedOuter] = context.withNestedScopeReturnCaptured(() => {
      expect(() =>
        context.addLocalValueType('a', 3, () => {
          throw new Error();
        })
      ).toThrow();
      context.addLocalValueType('c', 3, error);
      context.addLocalValueType('d', 3, error);
      context.getLocalValueType('a');
      const [, capturedInner] = context.withNestedScopeReturnCaptured(() => {
        context.getLocalValueType('a');
        context.getLocalValueType('b');
        context.getLocalValueType('d');
      });
      expect(Array.from(capturedInner.keys())).toEqual(['a', 'b', 'd']);
    });

    expect(Array.from(capturedOuter.keys())).toEqual(['a', 'b']);
  });

  it('UnionFind basic methods test', () => {
    const unionFind = new UnionFind();
    unionFind.getParent(0);
    unionFind.getTreeSize(1);
    unionFind.link(2, 3);
    unionFind.link(1, 3);
    unionFind.link(1, 1);
  });

  it('UnionFind disjoint test', () => {
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

  it('UnionFind chain test', () => {
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

  it('UnionFind stress test', () => {
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
});
