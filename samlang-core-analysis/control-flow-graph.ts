import type { LLVMInstruction } from 'samlang-core-ast/llvm-nodes';
import type { MidIRStatement } from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

interface Adapter<I> {
  /** @returns the label if the given instruction is the label instruction. */
  getLabel(instruction: I): string | null;
  /** @returns the jump label if the given instruction is the jump instruction. */
  getJumpLabel(instruction: I): string | null;
  /** @returns the first label of condition jump if the given instruction is the conditional jump (fall-through) instruction. */
  getConditionalJumpLabel(instruction: I): string | readonly string[] | null;
  /** @returns whether the instruction is a return statement. */
  isReturn(instruction: I): boolean;
}

const midIRAdapter: Adapter<MidIRStatement> = {
  getLabel: (instruction) =>
    instruction.__type__ === 'MidIRLabelStatement' ? instruction.name : null,
  getJumpLabel: (instruction) =>
    instruction.__type__ === 'MidIRJumpStatement' ? instruction.label : null,
  getConditionalJumpLabel: (instruction) =>
    instruction.__type__ === 'MidIRConditionalJumpFallThrough' ? instruction.label1 : null,
  isReturn: (instruction) => instruction.__type__ === 'MidIRReturnStatement',
};

const LLVMIRAdapter: Adapter<LLVMInstruction> = {
  getLabel: (instruction) =>
    instruction.__type__ === 'LLVMLabelInstruction' ? instruction.name : null,
  getJumpLabel: (instruction) =>
    instruction.__type__ === 'LLVMJumpInstruction' ? instruction.branch : null,
  getConditionalJumpLabel: (instruction) => {
    switch (instruction.__type__) {
      case 'LLVMConditionalJumpInstruction':
        return [instruction.b1, instruction.b2];
      case 'LLVMSwitchInstruction':
        return Array.from(
          new Set([
            ...instruction.otherBranchNameWithValues.map((it) => it.branch),
            instruction.defaultBranchName,
          ])
        );
      default:
        return null;
    }
  },
  isReturn: (instruction) => instruction.__type__ === 'LLVMReturnInstruction',
};

export type ControlFlowGraphNode<I> = { readonly id: number; readonly instruction: I };

export default class ControlFlowGraph<I> {
  private readonly nodeMap: Map<number, ControlFlowGraphNode<I>> = new Map();

  private readonly childrenMap: Map<number, readonly number[]> = new Map();

  private readonly parentMap: Map<number, Set<number>> = new Map();

  static readonly fromMidIRStatements = (
    statements: readonly MidIRStatement[]
  ): ControlFlowGraph<MidIRStatement> => new ControlFlowGraph(statements, midIRAdapter);

  static readonly fromLLVMInstructions = (
    instructions: readonly LLVMInstruction[]
  ): ControlFlowGraph<LLVMInstruction> => new ControlFlowGraph(instructions, LLVMIRAdapter);

  private constructor(
    instructions: readonly I[],
    { getLabel, getJumpLabel, getConditionalJumpLabel, isReturn }: Adapter<I>
  ) {
    // First pass: construct nodeMap and labelIdMap
    const labelIdMap = new Map<string, number>();
    instructions.forEach((instruction, id) => {
      this.nodeMap.set(id, { id, instruction });
      const label = getLabel(instruction);
      if (label != null) {
        labelIdMap.set(label, id);
      }
    });
    // Second pass: construct childrenMap
    instructions.forEach((instruction, id) => {
      const jumpLabel = getJumpLabel(instruction);
      if (jumpLabel != null) {
        const nextID = checkNotNull(labelIdMap.get(jumpLabel));
        this.childrenMap.set(id, [nextID]);
        return;
      }
      const conditionalJumpLabel = getConditionalJumpLabel(instruction);
      if (conditionalJumpLabel != null) {
        if (typeof conditionalJumpLabel !== 'string') {
          this.childrenMap.set(
            id,
            conditionalJumpLabel.map((it) => checkNotNull(labelIdMap.get(it)))
          );
          return;
        }
        const jumpToId = checkNotNull(labelIdMap.get(conditionalJumpLabel));
        const nextList = [jumpToId];
        // istanbul ignore next
        if (id !== instructions.length - 1) nextList.push(id + 1);
        this.childrenMap.set(id, nextList);
        return;
      }
      if (!isReturn(instruction) && id !== instructions.length - 1) {
        this.childrenMap.set(id, [id + 1]);
      }
    });
    // Third pass: construct parentMap
    this.childrenMap.forEach((children, parentId) => {
      children.forEach((childId) => {
        const childrenSet = this.parentMap.get(childId);
        if (childrenSet == null) {
          this.parentMap.set(childId, new Set([parentId]));
        } else {
          childrenSet.add(parentId);
        }
      });
    });
  }

  get nodes(): readonly ControlFlowGraphNode<I>[] {
    return Array.from(this.nodeMap.values());
  }

  get startNode(): ControlFlowGraphNode<I> {
    const node = this.nodeMap.get(0);
    // istanbul ignore next
    if (node == null) throw new Error('Empty instructions!');
    return node;
  }

  getChildrenIds(id: number): readonly number[] {
    return this.childrenMap.get(id) ?? [];
  }

  getParentIds(id: number): ReadonlySet<number> {
    return this.parentMap.get(id) ?? new Set();
  }

  getChildren(id: number): readonly ControlFlowGraphNode<I>[] {
    return this.getChildrenIds(id).map((childId) => {
      const node = this.nodeMap.get(childId);
      // istanbul ignore next
      if (node == null) throw new Error();
      return node;
    });
  }

  dfs(visitor: (node: ControlFlowGraphNode<I>) => void): void {
    const stack = [this.startNode];
    const visited = new Set<number>();
    while (stack.length > 0) {
      const node = stack.pop();
      // istanbul ignore next
      if (node == null) throw new Error();
      if (!visited.has(node.id)) {
        visited.add(node.id);
        visitor(node);
        stack.push(...this.getChildren(node.id));
      }
    }
  }
}
