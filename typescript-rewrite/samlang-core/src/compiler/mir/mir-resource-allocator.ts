import type { GlobalVariable } from '../../ast/common/structs';

export default class MidIRResourceAllocator {
  private nextGlobalVariableId = 0;

  private nextLabelId = 0;

  private globalVariableReferenceMap: Map<string, GlobalVariable> = new Map();

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

  allocateLabel(functionName: string): string {
    const temp = this.nextLabelId;
    this.nextLabelId += 1;
    return `LABEL_${functionName}_${temp}`;
  }

  allocateLabelWithAnnotation(functionName: string, annotation: string): string {
    const temp = this.nextLabelId;
    this.nextLabelId += 1;
    return `LABEL_${functionName}_${temp}_PURPOSE_${annotation}`;
  }
}
