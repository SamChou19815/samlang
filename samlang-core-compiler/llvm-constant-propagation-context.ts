import type { LLVMValue } from 'samlang-core-ast/llvm-nodes';
import { error, LocalStackedContext } from 'samlang-core-utils';

export default class LLVMConstantPropagationContext extends LocalStackedContext<LLVMValue> {
  addLocalValueType(name: string, value: LLVMValue, onCollision: () => void): void {
    if (value.__type__ !== 'LLVMVariable') {
      super.addLocalValueType(name, value, onCollision);
      return;
    }
    super.addLocalValueType(name, this.getLocalValueType(value.name) ?? value, onCollision);
  }

  bind(name: string, value: LLVMValue): void {
    this.addLocalValueType(name, value, error);
  }
}