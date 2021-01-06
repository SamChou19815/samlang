export default class MidIRResourceAllocator {
  private nextLabelId = 0;

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
