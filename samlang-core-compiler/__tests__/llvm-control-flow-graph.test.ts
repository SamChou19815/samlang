import {
  LLVMInstruction,
  LLVM_INT,
  LLVM_INT_TYPE,
  LLVM_VARIABLE,
  LLVM_CAST,
  LLVM_LABEL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_RETURN,
} from 'samlang-core-ast/llvm-nodes';

import { ControlFlowGraph } from '../llvm-control-flow-graph';

describe('control-flow-graph', () => {
  const llvmStatements: readonly LLVMInstruction[] = [
    LLVM_LABEL('foo'),
    LLVM_LABEL('bar'),
    LLVM_CAST({
      resultVariable: 'a',
      resultType: LLVM_INT_TYPE,
      sourceValue: LLVM_VARIABLE('b'),
      sourceType: LLVM_INT_TYPE,
    }),
    LLVM_CJUMP(LLVM_VARIABLE(''), 'baz', 'fall'),
    LLVM_LABEL('fall'),
    LLVM_JUMP('baz'),
    LLVM_LABEL('baz'),
    LLVM_RETURN(LLVM_INT(0), LLVM_INT_TYPE),
    LLVM_RETURN(LLVM_INT(0), LLVM_INT_TYPE),
  ];
  const llvmGraph = ControlFlowGraph.fromLLVMInstructions(llvmStatements);

  it('DFS should hit all the reachable statements for llvmGraph.', () => {
    const visited = new Set<number>();
    llvmGraph.dfs((node) => {
      visited.add(node.id);
    });
    expect(Array.from(visited.values()).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('DFS should not be able to get to unreachable statements.', () => {
    llvmGraph.dfs((node) => {
      if (node.id > 7) {
        throw new Error('We should not hit the final unreachable return.');
      }
    });
  });
});
