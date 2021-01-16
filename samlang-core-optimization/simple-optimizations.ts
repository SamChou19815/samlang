import ControlFlowGraph from 'samlang-core-analysis/control-flow-graph';
import type { LLVMInstruction } from 'samlang-core-ast/llvm-nodes';

const withoutUnreachableCode = <I>(
  instructions: readonly I[],
  controlFlowGraphConstructor: (instructionList: readonly I[]) => ControlFlowGraph<I>
): readonly I[] => {
  const reachableSet = new Set<number>();
  controlFlowGraphConstructor(instructions).dfs((node) => reachableSet.add(node.id));
  return instructions.filter((_, index) => reachableSet.has(index));
};

// eslint-disable-next-line import/prefer-default-export
export const withoutUnreachableLLVMCode = (
  instructions: readonly LLVMInstruction[]
): readonly LLVMInstruction[] =>
  withoutUnreachableCode(instructions, ControlFlowGraph.fromLLVMInstructions);
