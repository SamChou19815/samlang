export default class OptimizationResourceAllocator {
  private tailrecTemporaryID = 0;
  private cseHoistingTemporaryID = 0;
  private inliningPrefixID = 0;

  allocateTailRecTemporary(): string {
    const temporary = `_tailrec_${this.tailrecTemporaryID}_`;
    this.tailrecTemporaryID += 1;
    return temporary;
  }

  allocateCSEHoistedTemporary(): string {
    const temporary = `_cse_${this.cseHoistingTemporaryID}_`;
    this.cseHoistingTemporaryID += 1;
    return temporary;
  }

  allocateInliningTemporaryPrefix(): string {
    const prefix = `_inline_${this.inliningPrefixID}_`;
    this.inliningPrefixID += 1;
    return prefix;
  }
}
