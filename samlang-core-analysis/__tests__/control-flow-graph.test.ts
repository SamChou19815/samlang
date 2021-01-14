import ControlFlowGraph from '../control-flow-graph';

import {
  LLVMInstruction,
  LLVM_INT,
  LLVM_INT_TYPE,
  LLVM_VARIABLE,
  LLVM_CAST,
  LLVM_LABEL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_SWITCH,
  LLVM_RETURN,
} from 'samlang-core-ast/llvm-nodes';

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
  LLVM_SWITCH(LLVM_VARIABLE(''), 'baz', [{ value: 0, branch: 'baz' }]),
  LLVM_RETURN(LLVM_INT(0), LLVM_INT_TYPE),
];
const llvmGraph = ControlFlowGraph.fromLLVMInstructions(llvmStatements);

it('Control flow graph should preserve order.', () => {
  expect(llvmGraph.nodes.map((it) => it.instruction)).toEqual(llvmStatements);
});

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
      fail('We should not hit the final unreachable return.');
    }
  });
});

it('getParentIds is correct for llvmGraph.', () => {
  const parentOf = (id: number) =>
    Array.from(llvmGraph.getParentIds(id).values()).sort((a, b) => a - b);
  expect(parentOf(0)).toEqual([]);
  expect(parentOf(1)).toEqual([0]);
  expect(parentOf(2)).toEqual([1]);
  expect(parentOf(3)).toEqual([2]);
  expect(parentOf(4)).toEqual([3]);
  expect(parentOf(5)).toEqual([4]);
  expect(parentOf(6)).toEqual([3, 5, 8]);
});
