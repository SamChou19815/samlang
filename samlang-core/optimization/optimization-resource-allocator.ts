export default class OptimizationResourceAllocator {
  private cseHoistingTemporaryID = 0;

  private inliningPrefixID = 0;

  allocateCSEHoistedTemporary(): string {
    const temporary = `_CSE_HOISTING_${this.cseHoistingTemporaryID}_`;
    this.cseHoistingTemporaryID += 1;
    return temporary;
  }

  allocateInliningTemporaryPrefix(): string {
    const prefix = `_INLINING_${this.inliningPrefixID}_`;
    this.inliningPrefixID += 1;
    return prefix;
  }

  allocateInliningLabelPrefix(): string {
    const prefix = `INLINING_${this.inliningPrefixID}_`;
    this.inliningPrefixID += 1;
    return prefix;
  }
}
