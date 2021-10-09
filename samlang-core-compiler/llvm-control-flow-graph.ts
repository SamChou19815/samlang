import type { LLVMInstruction } from 'samlang-core-ast/llvm-nodes';
import { checkNotNull } from 'samlang-core/utils';

export type ControlFlowGraphNode = { readonly id: number; readonly instruction: LLVMInstruction };

export class ControlFlowGraph {
  private readonly nodeMap: Map<number, ControlFlowGraphNode> = new Map();

  private readonly childrenMap: Map<number, readonly number[]> = new Map();

  static readonly fromLLVMInstructions = (
    instructions: readonly LLVMInstruction[]
  ): ControlFlowGraph => new ControlFlowGraph(instructions);

  private constructor(instructions: readonly LLVMInstruction[]) {
    // First pass: construct nodeMap and labelIdMap
    const labelIdMap = new Map<string, number>();
    instructions.forEach((instruction, id) => {
      this.nodeMap.set(id, { id, instruction });
      const label = instruction.__type__ === 'LLVMLabelInstruction' ? instruction.name : null;
      if (label != null) {
        labelIdMap.set(label, id);
      }
    });
    // Second pass: construct childrenMap
    instructions.forEach((instruction, id) => {
      const jumpLabel = instruction.__type__ === 'LLVMJumpInstruction' ? instruction.branch : null;
      if (jumpLabel != null) {
        const nextID = checkNotNull(labelIdMap.get(jumpLabel));
        this.childrenMap.set(id, [nextID]);
        return;
      }
      const conditionalJumpLabel =
        instruction.__type__ === 'LLVMConditionalJumpInstruction'
          ? [instruction.b1, instruction.b2]
          : null;
      if (conditionalJumpLabel != null) {
        this.childrenMap.set(
          id,
          conditionalJumpLabel.map((it) => checkNotNull(labelIdMap.get(it), `Missing ${it}`))
        );
        return;
      }
      if (instruction.__type__ !== 'LLVMReturnInstruction' && id !== instructions.length - 1) {
        this.childrenMap.set(id, [id + 1]);
      }
    });
  }

  dfs(visitor: (node: ControlFlowGraphNode) => void): void {
    const stack = [checkNotNull(this.nodeMap.get(0), 'Empty instructions!')];
    const visited = new Set<number>();
    while (stack.length > 0) {
      const node = checkNotNull(stack.pop());
      if (!visited.has(node.id)) {
        visited.add(node.id);
        visitor(node);
        stack.push(
          ...(this.childrenMap.get(node.id) ?? []).map((childId) =>
            checkNotNull(this.nodeMap.get(childId))
          )
        );
      }
    }
  }
}

export function withoutUnreachableLLVMCode(
  instructions: readonly LLVMInstruction[]
): readonly LLVMInstruction[] {
  const reachableSet = new Set<number>();
  ControlFlowGraph.fromLLVMInstructions(instructions).dfs((node) => reachableSet.add(node.id));
  return instructions.filter((_, index) => reachableSet.has(index));
}
