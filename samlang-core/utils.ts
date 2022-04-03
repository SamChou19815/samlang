export function intArrayToDataString(array: readonly number[]): string {
  return Array.from(new Uint8Array(new Uint32Array(array).buffer).values())
    .map((n) => {
      if (n === 0) return '\\00';
      const hex = n.toString(16);
      return `\\${'0'.repeat(2 - hex.length)}${hex}`;
    })
    .join('');
}

export function error(message?: string): never {
  throw new Error(message);
}

export const isNotNull = <V>(value: V | null | undefined): value is V => value != null;

export const ignore = (): void => {};

export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

export const checkNotNull = <V>(value: V | null | undefined, msg?: string): V => {
  assert(value != null, msg ?? `Value is asserted to be not null, but it is ${value}.`);
  return value;
};

export const zip = <A, B>(list1: readonly A[], list2: readonly B[]): readonly (readonly [A, B])[] =>
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  list1.map((e1, i) => [e1, list2[i]!]);

export const zip3 = <A, B, C>(
  list1: readonly A[],
  list2: readonly B[],
  list3: readonly C[]
): readonly (readonly [A, B, C])[] =>
  list1.map((e1, i) => [e1, checkNotNull(list2[i]), checkNotNull(list3[i])]);

export function filterMap<T, R>(
  list: readonly T[],
  filterMapper: (value: T, index: number, array: readonly T[]) => R | null | undefined
): readonly R[] {
  const result: R[] = [];
  list.forEach((value, index, array) => {
    const mapped = filterMapper(value, index, array);
    if (mapped != null) result.push(mapped);
  });
  return result;
}

export interface ReadonlyHashMap<K, V> {
  readonly get: (key: K) => V | undefined;
  readonly forceGet: (key: K) => V;
  readonly has: (key: K) => boolean;
  readonly size: number;
  readonly forEach: (callbackFunction: (value: V, key: K) => void) => void;
  readonly entries: () => readonly (readonly [K, V])[];
}

export interface HashMap<K, V> extends ReadonlyHashMap<K, V> {
  readonly clear: () => void;
  readonly delete: (key: K) => boolean;
  readonly set: (key: K, value: V) => this;
}

export interface ReadonlyHashSet<T> {
  readonly forEach: (callbackFunction: (value: T) => void) => void;
  readonly toArray: () => T[];
  readonly has: (value: T) => boolean;
  readonly size: number;
}

export interface HashSet<T> extends ReadonlyHashSet<T> {
  readonly add: (value: T) => this;
  readonly clear: () => void;
  readonly delete: (value: T) => boolean;
}

class HashMapImpl<K, V> implements HashMap<K, V> {
  private backingMap: Map<string | number, readonly [K, V]>;

  constructor(
    private readonly uniqueHash: (key: K) => string | number,
    keyValuePairs: readonly (readonly [K, V])[]
  ) {
    this.backingMap = new Map(keyValuePairs.map((pair) => [uniqueHash(pair[0]), pair] as const));
  }

  clear(): void {
    this.backingMap.clear();
  }

  delete(key: K): boolean {
    return this.backingMap.delete(this.uniqueHash(key));
  }

  set(key: K, value: V): this {
    this.backingMap.set(this.uniqueHash(key), [key, value]);
    return this;
  }

  get(key: K): V | undefined {
    return this.backingMap.get(this.uniqueHash(key))?.[1];
  }

  forceGet(key: K): V {
    return checkNotNull(this.get(key));
  }

  has(key: K): boolean {
    return this.backingMap.has(this.uniqueHash(key));
  }

  get size(): number {
    return this.backingMap.size;
  }

  forEach(callbackFunction: (value: V, key: K) => void): void {
    this.backingMap.forEach(([key, value]) => callbackFunction(value, key));
  }

  entries(): readonly (readonly [K, V])[] {
    const entries: (readonly [K, V])[] = [];
    this.backingMap.forEach((keyValue) => entries.push(keyValue));
    return entries;
  }
}

class HashSetImpl<T> implements HashSet<T> {
  private backingMap: Map<string | number, T>;

  constructor(private readonly uniqueHash: (key: T) => string | number, values: readonly T[]) {
    this.backingMap = new Map(values.map((value) => [uniqueHash(value), value] as const));
  }

  add(value: T): this {
    this.backingMap.set(this.uniqueHash(value), value);
    return this;
  }

  clear(): void {
    this.backingMap.clear();
  }

  delete(value: T): boolean {
    return this.backingMap.delete(this.uniqueHash(value));
  }

  forEach(callbackFunction: (value: T) => void): void {
    this.backingMap.forEach(callbackFunction);
  }

  toArray(): T[] {
    const array: T[] = [];
    this.forEach((element) => array.push(element));
    return array;
  }

  has(value: T): boolean {
    return this.backingMap.has(this.uniqueHash(value));
  }

  get size(): number {
    return this.backingMap.size;
  }
}

export interface CollectionsConstructors<K> {
  hashMapOf<V>(...keyValuePairs: readonly (readonly [K, V])[]): HashMap<K, V>;
  mapOf<V>(...keyValuePairs: readonly (readonly [K, V])[]): ReadonlyHashMap<K, V>;
  hashSetOf(...values: readonly K[]): HashSet<K>;
  setOf(...values: readonly K[]): ReadonlyHashSet<K>;
}

export function createCollectionConstructors<K>(
  uniqueHash: (key: K) => string | number
): CollectionsConstructors<K> {
  return {
    hashMapOf: (...keyValuePairs) => new HashMapImpl(uniqueHash, keyValuePairs),
    mapOf: (...keyValuePairs) => new HashMapImpl(uniqueHash, keyValuePairs),
    hashSetOf: (...values) => new HashSetImpl(uniqueHash, values),
    setOf: (...values) => new HashSetImpl(uniqueHash, values),
  };
}

export const listShallowEquals = <T>(list1: readonly T[], list2: readonly T[]): boolean => {
  const length = list1.length;
  if (length !== list2.length) {
    return false;
  }
  for (let i = 0; i < length; i += 1) {
    if (list1[i] !== list2[i]) {
      return false;
    }
  }
  return true;
};

export const mapEquals = <K, V>(
  map1: ReadonlyMap<K, V> | ReadonlyMap<K, V>,
  map2: ReadonlyMap<K, V>,
  valueEqualityTester: (v1: V, v2: V) => boolean = (v1, v2) => v1 === v2
): boolean => {
  if (map1.size !== map2.size) {
    return false;
  }
  return Array.from(map1.entries()).every(([key, v1]) => {
    const v2 = map2.get(key);
    if (v2 == null) {
      return false;
    }
    return valueEqualityTester(v1, v2);
  });
};

export const hashMapEquals = <K, V>(
  map1: ReadonlyHashMap<K, V>,
  map2: ReadonlyHashMap<K, V>,
  valueEqualityTester: (v1: V, v2: V) => boolean = (v1, v2) => v1 === v2
): boolean => {
  if (map1.size !== map2.size) {
    return false;
  }
  return map1.entries().every(([key, v1]) => {
    const v2 = map2.get(key);
    if (v2 == null) {
      return false;
    }
    return valueEqualityTester(v1, v2);
  });
};

export const setEquals = <E>(set1: ReadonlySet<E>, set2: ReadonlySet<E>): boolean => {
  if (set1.size !== set2.size) {
    return false;
  }
  return Array.from(set1).every((value) => set2.has(value));
};

/** One layer of the context. We should stack a new layer when encounter a new nested scope. */
class ContextLayer<V> {
  readonly localValues: Map<string, V> = new Map();

  readonly capturedValues: Map<string, V> = new Map();

  getLocalValue(name: string): V | undefined {
    return this.localValues.get(name);
  }

  addLocalValue(name: string, value: V, onCollision: () => void): void {
    if (this.localValues.has(name)) {
      onCollision();
      return;
    }
    this.localValues.set(name, value);
  }
}

export class LocalStackedContext<V> {
  private readonly stacks: ContextLayer<V>[] = [new ContextLayer<V>()];

  getLocalValueType(name: string): V | undefined {
    const closestStackType = checkNotNull(this.stacks[this.stacks.length - 1]).getLocalValue(name);
    if (closestStackType != null) {
      return closestStackType;
    }
    for (let level = this.stacks.length - 2; level >= 0; level -= 1) {
      const stack = checkNotNull(this.stacks[level]);
      const type = stack.getLocalValue(name);
      if (type != null) {
        for (
          let capturedLevel = level + 1;
          capturedLevel < this.stacks.length;
          capturedLevel += 1
        ) {
          checkNotNull(this.stacks[capturedLevel]).capturedValues.set(name, type);
        }
        return type;
      }
    }
    return undefined;
  }

  addLocalValueType(name: string, value: V, onCollision: () => void): void {
    for (let level = 0; level < this.stacks.length - 1; level += 1) {
      const previousLevelType = checkNotNull(this.stacks[level]).getLocalValue(name);
      if (previousLevelType != null) {
        onCollision();
      }
    }
    checkNotNull(this.stacks[this.stacks.length - 1]).addLocalValue(name, value, onCollision);
  }

  withNestedScope<T>(block: () => T): T {
    this.stacks.push(new ContextLayer());
    const result = block();
    this.stacks.pop();
    return result;
  }

  withNestedScopeReturnCaptured<T>(block: () => T): readonly [T, ReadonlyMap<string, V>] {
    const layer = new ContextLayer<V>();
    this.stacks.push(layer);
    const result = block();
    this.stacks.pop();
    return [result, layer.capturedValues];
  }
}

/** A lazily allocated union find data structure. */
export class UnionFind {
  private readonly parent: Map<number, number> = new Map();

  private readonly treeSize: Map<number, number> = new Map();

  getParent(index: number): number {
    const currentParent = this.parent.get(index);
    if (currentParent == null) {
      this.parent.set(index, index);
      this.treeSize.set(index, 1);
      return index;
    }
    return currentParent;
  }

  getTreeSize(index: number): number {
    const currentTreeSize = this.treeSize.get(index);
    if (currentTreeSize == null) {
      this.parent.set(index, index);
      this.treeSize.set(index, 1);
      return 1;
    }
    return currentTreeSize;
  }

  isLinked(i: number, j: number): boolean {
    return this.findRoot(i) === this.findRoot(j);
  }

  findRoot(index: number): number {
    const currentParent = this.getParent(index);
    if (currentParent === index) {
      return currentParent;
    }
    const parentOfParent = this.findRoot(currentParent);
    this.parent.set(index, parentOfParent);
    return parentOfParent;
  }

  link(i: number, j: number): number {
    let iRoot = this.findRoot(i);
    let jRoot = this.findRoot(j);
    if (iRoot === jRoot) {
      return iRoot;
    }
    if (this.getTreeSize(iRoot) < this.getTreeSize(jRoot)) {
      const temp = iRoot;
      iRoot = jRoot;
      jRoot = temp;
    }
    this.parent.set(jRoot, iRoot);
    this.treeSize.set(iRoot, this.getTreeSize(iRoot) + this.getTreeSize(jRoot));
    return iRoot;
  }
}
