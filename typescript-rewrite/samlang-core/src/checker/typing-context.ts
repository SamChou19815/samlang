import type ModuleReference from '../ast/common/module-reference';
import type { TypeDefinition } from '../ast/common/structs';
import type { FunctionType, Type } from '../ast/common/types';
import { HashMap, ReadonlyHashMap } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';

/** One layer of the typing context. We should stack a new layer when encounter a new nested scope. */
class ContextLayer {
  private readonly localValues: Map<string, Type> = new Map();

  readonly capturedValues: Map<string, Type> = new Map();

  getLocalValueType(name: string): Type | undefined {
    return this.localValues.get(name);
  }

  addLocalValueType(name: string, type: Type, onCollision: () => void) {
    if (this.localValues.has(name)) {
      onCollision();
      return;
    }
    this.localValues.set(name, type);
  }

  removeLocalValue(name: string): void {
    if (!this.localValues.delete(name)) {
      throw new Error(`${name} is not found in this layer!`);
    }
  }
}

export class LocalTypingContext {
  private readonly stacks: ContextLayer[] = [new ContextLayer()];

  getLocalValueType(name: string): Type | undefined {
    const closestStackType = this.stacks[this.stacks.length - 1].getLocalValueType(name);
    if (closestStackType != null) {
      return closestStackType;
    }
    for (let level = this.stacks.length - 2; level >= 0; level -= 1) {
      const stack = this.stacks[level];
      const type = stack.getLocalValueType(name);
      if (type != null) {
        for (
          let capturedLevel = level + 1;
          capturedLevel < this.stacks.length;
          capturedLevel += 1
        ) {
          this.stacks[capturedLevel].capturedValues.set(name, type);
        }
        return type;
      }
    }
    return undefined;
  }

  addLocalValueType(name: string, type: Type, onCollision: () => void): void {
    for (let level = 0; level < this.stacks.length - 1; level += 1) {
      const previousLevelType = this.stacks[level].getLocalValueType(name);
      if (previousLevelType != null) {
        onCollision();
      }
    }
    this.stacks[this.stacks.length - 1].addLocalValueType(name, type, onCollision);
  }

  removeLocalValue(name: string): void {
    this.stacks[this.stacks.length - 1].removeLocalValue(name);
  }

  withNestedScope<T>(block: () => T): T {
    this.stacks.push(new ContextLayer());
    const result = block();
    this.stacks.pop();
    return result;
  }

  withNestedScopeReturnCaptured<T>(block: () => T): readonly [T, ReadonlyMap<string, Type>] {
    this.stacks.push(new ContextLayer());
    const result = block();
    const removedStack = this.stacks.pop();
    assertNotNull(removedStack);
    return [result, removedStack.capturedValues];
  }
}

export interface MemberTypeInformation {
  readonly isPublic: boolean;
  readonly typeParameters: readonly string[];
  readonly type: FunctionType;
}

export interface ClassTypingContext {
  readonly typeDefinition?: TypeDefinition;
  readonly functions: Readonly<Record<string, MemberTypeInformation | undefined>>;
  readonly methods: Readonly<Record<string, MemberTypeInformation | undefined>>;
}

export interface ModuleTypingContext {
  readonly importedClasses: Record<string, ClassTypingContext | undefined>;
  readonly definedClasses: Record<string, ClassTypingContext | undefined>;
}

export type GlobalTypingContext = HashMap<ModuleReference, ModuleTypingContext>;
export type ReadonlyGlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;
