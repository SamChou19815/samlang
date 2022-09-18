import {
  assert,
  checkNotNull,
  createCollectionConstructors,
  error,
  filterMap,
  hashMapEquals,
  ignore,
  intArrayToDataString,
  isNotNull,
  listShallowEquals,
  LocalStackedContext,
  mapEquals,
  setEquals,
  zip,
  zip3,
} from '../utils';

describe('samlang-utils', () => {
  it('intArrayToDataString test', () => {
    expect(intArrayToDataString([1, 2, 3, 4])).toBe(
      '\\01\\00\\00\\00\\02\\00\\00\\00\\03\\00\\00\\00\\04\\00\\00\\00',
    );
    expect(intArrayToDataString([1, 124, 4531, 33])).toBe(
      '\\01\\00\\00\\00\\7c\\00\\00\\00\\b3\\11\\00\\00\\21\\00\\00\\00',
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
    expect(createCollectionConstructors(() => 1).mapOf().size).toBe(0);
    expect(createCollectionConstructors(() => 1).setOf().size).toBe(0);
    expect(
      createCollectionConstructors((s: string) => s.toLowerCase()).mapOf(
        ['a', 3],
        ['b', 4],
        ['A', 4],
      ).size,
    ).toBe(2);
    expect(
      createCollectionConstructors((s: string) => s.toLowerCase()).setOf('a', 'B', 'A').size,
    ).toBe(2);
  });

  const { hashMapOf, hashSetOf } = createCollectionConstructors((n: number) => n);

  it('map tests', () => {
    const map = hashMapOf([1, 1], [2, 2]);

    map.forEach(() => {});

    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(2);
    expect(map.get(3)).toBeUndefined();
    expect(map.has(1)).toBeTruthy();
    expect(map.has(2)).toBeTruthy();
    expect(map.has(3)).toBeFalsy();
    expect(map.size).toBe(2);

    map.set(1, 3);
    expect(map.get(1)).toBe(3);
    expect(map.get(2)).toBe(2);
    expect(map.get(3)).toBeUndefined();
    expect(map.has(1)).toBeTruthy();
    expect(map.has(2)).toBeTruthy();
    expect(map.has(3)).toBeFalsy();
    expect(map.size).toBe(2);

    map.delete(1);
    expect(map.get(1)).toBeUndefined();
    expect(map.get(2)).toBe(2);
    expect(map.get(3)).toBeUndefined();
    expect(map.has(1)).toBeFalsy();
    expect(map.has(2)).toBeTruthy();
    expect(map.has(3)).toBeFalsy();
    expect(map.size).toBe(1);

    map.clear();
    expect(map.get(1)).toBeUndefined();
    expect(map.get(2)).toBeUndefined();
    expect(map.get(3)).toBeUndefined();
    expect(map.has(1)).toBeFalsy();
    expect(map.has(2)).toBeFalsy();
    expect(map.has(3)).toBeFalsy();
    expect(map.size).toBe(0);
    map.forEach(() => {
      throw new Error();
    });
  });

  it('set tests', () => {
    const set = hashSetOf(1, 2);

    set.forEach(() => {});

    expect(set.has(1)).toBeTruthy();
    expect(set.has(2)).toBeTruthy();
    expect(set.has(3)).toBeFalsy();
    expect(set.size).toBe(2);

    set.add(1);
    expect(set.has(1)).toBeTruthy();
    expect(set.has(2)).toBeTruthy();
    expect(set.has(3)).toBeFalsy();
    expect(set.size).toBe(2);

    set.delete(1);
    expect(set.has(1)).toBeFalsy();
    expect(set.has(2)).toBeTruthy();
    expect(set.has(3)).toBeFalsy();
    expect(set.size).toBe(1);

    set.clear();
    expect(set.has(1)).toBeFalsy();
    expect(set.has(2)).toBeFalsy();
    expect(set.has(3)).toBeFalsy();
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
    expect(hashMapEquals(hashMapOf(), hashMapOf([1, 1]))).toBeFalsy();
    expect(hashMapEquals(hashMapOf([2, 1]), hashMapOf([1, 1]))).toBeFalsy();
    expect(hashMapEquals(hashMapOf([1, 1]), hashMapOf([1, 1]))).toBeTruthy();
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

  it('LocalStackedContext can compute captured values.', () => {
    const context = new LocalStackedContext();
    context.addLocalValueType('a', 3, error);
    context.addLocalValueType('b', 3, error);
    const [, capturedOuter] = context.withNestedScopeReturnCaptured(() => {
      expect(() =>
        context.addLocalValueType('a', 3, () => {
          throw new Error();
        }),
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
});
