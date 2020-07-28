import type { MidIRStatement } from '../ast/mir';

interface Adapter<I> {
  /** @returns the label if the given instruction is the label instruction. */
  getLabel(instruction: I): string | null;
  /** @returns the jump label if the given instruction is the jump instruction. */
  getJumpLabel(instruction: I): string | null;
  /** @returns the first label of condition jump if the given instruction is the conditional jump (fall-through) instruction. */
  getConditionalJumpLabel(instruction: I): string | null;
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

export type ControlFlowGraphNode<I> = { readonly id: number; readonly instruction: I };

export default class ControlFlowGraph<I> {
  private readonly nodeMap: Map<number, ControlFlowGraphNode<I>> = new Map();

  private readonly childrenMap: Map<number, readonly number[]> = new Map();

  private readonly parentMap: Map<number, Set<number>> = new Map();

  static readonly fromMidIRStatements = (
    statements: readonly MidIRStatement[]
  ): ControlFlowGraph<MidIRStatement> => new ControlFlowGraph(statements, midIRAdapter);

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
        const nextID = labelIdMap.get(jumpLabel);
        // istanbul ignore next
        if (nextID == null) throw new Error(`Bad jump label: ${jumpLabel}`);
        this.childrenMap.set(id, [nextID]);
        return;
      }
      const conditionalJumpLabel = getConditionalJumpLabel(instruction);
      if (conditionalJumpLabel != null) {
        const jumpToId = labelIdMap.get(conditionalJumpLabel);
        // istanbul ignore next
        if (jumpToId == null) throw new Error(`Bad cjump label: ${jumpLabel}`);
        const nextList = [jumpToId];
        // istanbul ignore next
        if (id !== instructions.length - 1) {
          nextList.push(id + 1);
        }
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
