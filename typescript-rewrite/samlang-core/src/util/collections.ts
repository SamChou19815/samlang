export interface Hashable {
  readonly uniqueHash: () => string | number;
}

export interface ReadonlyHashMap<K extends Hashable, V> {
  readonly get: (key: K) => V | undefined;
  readonly has: (key: K) => boolean;
  readonly size: number;
  readonly forEach: (callbackFunction: (value: V, key: K) => void) => void;
}

export interface HashMap<K extends Hashable, V> extends ReadonlyHashMap<K, V> {
  readonly clear: () => void;
  readonly delete: (key: K) => boolean;
  readonly set: (key: K, value: V) => this;
}

interface ReadonlyHashSet<T extends Hashable> {
  readonly forEach: (callbackFunction: (value: T) => void) => void;
  readonly has: (value: T) => boolean;
  readonly size: number;
}

interface HashSet<T extends Hashable> extends ReadonlyHashSet<T> {
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
