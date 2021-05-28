import type { GlobalVariable } from 'samlang-core-ast/common-nodes';

export default class MidIRStringManager {
  private nextGlobalVariableId = 0;

  private globalVariableReferenceMap: Map<string, GlobalVariable> = new Map();

  get globalVariables(): readonly GlobalVariable[] {
    return Array.from(this.globalVariableReferenceMap.values());
  }

  allocateStringArrayGlobalVariable(string: string): GlobalVariable {
    const existing = this.globalVariableReferenceMap.get(`STRING_CONTENT_${string}`);
    if (existing != null) {
      return existing;
    }
    const variable = { name: `GLOBAL_STRING_${this.nextGlobalVariableId}`, content: string };
    this.nextGlobalVariableId += 1;
    this.globalVariableReferenceMap.set(`STRING_CONTENT_${string}`, variable);
    return variable;
  }
}
