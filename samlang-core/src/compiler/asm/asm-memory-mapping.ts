import { AssemblyMemory, assemblyArgumentToString } from '../../ast/asm/asm-arguments';
import { Hashable, HashMap, hashMapOf } from '../../util/collections';

class MemoryWrapper implements Hashable {
  constructor(public readonly memory: AssemblyMemory) {}

  uniqueHash(): string {
    return assemblyArgumentToString(this.memory);
  }
}

export interface ReadonlyAssemblyMemoryMapping {
  get(memory: AssemblyMemory): AssemblyMemory | undefined;
}

export class AssemblyMemoryMapping implements ReadonlyAssemblyMemoryMapping {
  private backingMap: HashMap<MemoryWrapper, AssemblyMemory> = hashMapOf();

  get size(): number {
    return this.backingMap.size;
  }

  get(memory: AssemblyMemory): AssemblyMemory | undefined {
    return this.backingMap.get(new MemoryWrapper(memory));
  }

  set(key: AssemblyMemory, value: AssemblyMemory): void {
    this.backingMap.set(new MemoryWrapper(key), value);
  }
}
