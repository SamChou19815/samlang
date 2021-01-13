import Long from 'long';
export { Long };

export const error = (message?: string): never => {
  throw new Error(message);
};

export const MIN_I32_VALUE: Long = Long.fromInt(-2147483648);
export const MAX_I32_VALUE: Long = Long.fromInt(2147483647);

export const bigIntIsWithin32BitIntegerRange = (value: Long): boolean =>
  value.greaterThanOrEqual(MIN_I32_VALUE) && value.lessThanOrEqual(MAX_I32_VALUE);

export const logTwo = (number: Long): number =>
  number.equals(Long.ONE) ? 0 : 1 + logTwo(number.divide(Long.fromInt(2)));

export const isPowerOfTwo = (number: Long): boolean =>
  number.greaterThan(Long.ZERO) && number.and(number.subtract(Long.ONE)).equals(Long.ZERO);

export const isNotNull = <V>(value: V | null | undefined): value is V => value != null;

export function assertNotNull<V>(value: V | null | undefined): asserts value is V {
  if (value == null) {
    throw new Error(`Value is asserted to be not null, but it is ${value}.`);
  }
}

export const checkNotNull = <V>(value: V | null | undefined): V => {
  assertNotNull(value);
  return value;
};

export interface Hashable {
  readonly uniqueHash: () => string | number;
}

export interface ReadonlyHashMap<K extends Hashable, V> {
  readonly get: (key: K) => V | undefined;
  readonly has: (key: K) => boolean;
  readonly size: number;
  readonly forEach: (callbackFunction: (value: V, key: K) => void) => void;
  readonly entries: () => readonly (readonly [K, V])[];
}

export interface HashMap<K extends Hashable, V> extends ReadonlyHashMap<K, V> {
  readonly clear: () => void;
  readonly delete: (key: K) => boolean;
  readonly set: (key: K, value: V) => this;
}

export interface ReadonlyHashSet<T extends Hashable> {
  readonly forEach: (callbackFunction: (value: T) => void) => void;
  readonly toArray: () => T[];
  readonly has: (value: T) => boolean;
  readonly size: number;
}

export interface HashSet<T extends Hashable> extends ReadonlyHashSet<T> {
  readonly add: (value: T) => this;
  readonly clear: () => void;
  readonly delete: (value: T) => boolean;
}

class HashMapImpl<K extends Hashable, V> implements HashMap<K, V> {
  private backingMap: Map<string | number, readonly [K, V]>;

  constructor(keyValuePairs: readonly (readonly [K, V])[]) {
    this.backingMap = new Map(keyValuePairs.map((pair) => [pair[0].uniqueHash(), pair] as const));
  }

  clear(): void {
    this.backingMap.clear();
  }

  delete(key: K): boolean {
    return this.backingMap.delete(key.uniqueHash());
  }

  set(key: K, value: V): this {
    this.backingMap.set(key.uniqueHash(), [key, value]);
    return this;
  }

  get(key: K): V | undefined {
    return this.backingMap.get(key.uniqueHash())?.[1];
  }

  has(key: K): boolean {
    return this.backingMap.has(key.uniqueHash());
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

class HashSetImpl<T extends Hashable> implements HashSet<T> {
  private backingMap: Map<string | number, T>;

  constructor(values: readonly T[]) {
    this.backingMap = new Map(values.map((value) => [value.uniqueHash(), value] as const));
  }

  add(value: T): this {
    this.backingMap.set(value.uniqueHash(), value);
    return this;
  }

  clear(): void {
    this.backingMap.clear();
  }

  delete(value: T): boolean {
    return this.backingMap.delete(value.uniqueHash());
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
    return this.backingMap.has(value.uniqueHash());
  }

  get size(): number {
    return this.backingMap.size;
  }
}

export const hashMapOf = <K extends Hashable, V>(
  ...keyValuePairs: readonly (readonly [K, V])[]
): HashMap<K, V> => new HashMapImpl(keyValuePairs);

export const mapOf = <K extends Hashable, V>(
  ...keyValuePairs: readonly (readonly [K, V])[]
): ReadonlyHashMap<K, V> => new HashMapImpl(keyValuePairs);

export const hashSetOf = <T extends Hashable>(...values: readonly T[]): HashSet<T> =>
  new HashSetImpl(values);

export const setOf = <T extends Hashable>(...values: readonly T[]): ReadonlyHashSet<T> =>
  new HashSetImpl(values);

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

export const hashMapEquals = <K extends Hashable, V>(
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

  removeLocalValue(name: string): void {
    if (!this.localValues.delete(name)) {
      throw new Error(`${name} is not found in this layer!`);
    }
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
      const stack = this.stacks[level];
      assertNotNull(stack);
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

  removeLocalValue(name: string): void {
    checkNotNull(this.stacks[this.stacks.length - 1]).removeLocalValue(name);
  }

  withNestedScope<T>(block: () => T): T {
    this.stacks.push(new ContextLayer());
    const result = block();
    this.stacks.pop();
    return result;
  }

  withNestedScopeReturnScoped<T>(block: () => T): readonly [T, ReadonlyMap<string, V>] {
    const layer = new ContextLayer<V>();
    this.stacks.push(layer);
    const result = block();
    this.stacks.pop();
    return [result, layer.localValues];
  }

  withNestedScopeReturnCaptured<T>(block: () => T): readonly [T, ReadonlyMap<string, V>] {
    const layer = new ContextLayer<V>();
    this.stacks.push(layer);
    const result = block();
    this.stacks.pop();
    return [result, layer.capturedValues];
  }
}

/** An lazily allocated union find data structure. */
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
