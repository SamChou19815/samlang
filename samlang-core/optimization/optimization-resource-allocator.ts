export default class OptimizationResourceAllocator {
  private cseHoistingTemporaryID = 0;
  private inliningPrefixID = 0;
  private loopTemporaryID = 0;

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

  allocateLoopTemporary(): string {
    const prefix = `_loop_${this.loopTemporaryID}`;
    this.loopTemporaryID += 1;
    return prefix;
  }
}
