export default class MidIRResourceAllocator {
  private nextTempId = 0;
  private nextLabelId = 0;

  allocateTemp(purpose: string): string {
    const tempID = this.nextTempId;
    this.nextTempId += 1;
    return `_temp_${tempID}_${purpose}`;
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
