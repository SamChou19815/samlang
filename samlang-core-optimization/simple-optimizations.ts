import type { LLVMInstruction } from 'samlang-core-ast/llvm-nodes';

import ControlFlowGraph from './control-flow-graph';

export default function withoutUnreachableLLVMCode(
  instructions: readonly LLVMInstruction[]
): readonly LLVMInstruction[] {
  const reachableSet = new Set<number>();
  ControlFlowGraph.fromLLVMInstructions(instructions).dfs((node) => reachableSet.add(node.id));
  return instructions.filter((_, index) => reachableSet.has(index));
}
