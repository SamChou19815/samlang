import { ReadonlyMidIRBasicBlock } from './mir-basic-block';

type SizedImmutableStack = {
  readonly size: number;
  readonly block?: ReadonlyMidIRBasicBlock;
  readonly prev?: SizedImmutableStack;
};

const buildTrace = (
  block: ReadonlyMidIRBasicBlock,
  visitedLabels: Set<string>,
  memoizedResult: Map<string, SizedImmutableStack>
): SizedImmutableStack => {
  const optimal = memoizedResult.get(block.label);
  if (optimal != null) return optimal;
  visitedLabels.add(block.label);
  let bestTrace: SizedImmutableStack = { size: 0 };
  block.targets.forEach((nextBlock) => {
    // istanbul ignore next
    if (visitedLabels.has(nextBlock.label)) return;
    const fullTrace = buildTrace(nextBlock, visitedLabels, memoizedResult);
    if (fullTrace.size > bestTrace.size) {
      bestTrace = fullTrace;
    }
  });
  visitedLabels.delete(block.label);
  const knownOptimal = {
    size: bestTrace.size + block.allStatements.length,
    block,
    prev: bestTrace,
  };
  memoizedResult.set(block.label, knownOptimal);
  return knownOptimal;
};

const reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath = (
  basicBlocks: readonly ReadonlyMidIRBasicBlock[]
): readonly ReadonlyMidIRBasicBlock[] => {
  const reorderedBlockLabels = new Set<string>();
  const reorderedBlocks: ReadonlyMidIRBasicBlock[] = [];
  basicBlocks.forEach((blockToStart) => {
    if (reorderedBlockLabels.has(blockToStart.label)) {
      return;
    }
    let stack: SizedImmutableStack | undefined = buildTrace(
      blockToStart,
      reorderedBlockLabels,
      new Map()
    );
    const ordered: ReadonlyMidIRBasicBlock[] = [];
    while (stack != null) {
      const block = stack.block;
      if (block != null) {
        ordered.push(block);
      }
      stack = stack.prev;
    }
    ordered.forEach((it) => reorderedBlockLabels.add(it.label));
    reorderedBlocks.push(...ordered);
  });
  return reorderedBlocks;
};

export default reorderMidIRBasicBlocksToMaximizeLongestNoJumpPath;
