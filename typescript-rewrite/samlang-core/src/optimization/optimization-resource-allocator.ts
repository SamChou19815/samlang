export default class OptimizationResourceAllocator {
  private inliningPrefixID = 0;

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
