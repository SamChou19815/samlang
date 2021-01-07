import ControlFlowGraph from '../control-flow-graph';

import { ASM_JUMP, ASM_RET, ASM_LABEL } from 'samlang-core-ast/asm-instructions';
import { HIR_ONE, HIR_VARIABLE } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MIR_MOVE_TEMP,
  MIR_JUMP,
  MIR_CJUMP_FALLTHROUGH,
  MIR_LABEL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);

const statements = [
  MIR_LABEL('foo'),
  MIR_LABEL('bar'),
  MIR_MOVE_TEMP('a', MIR_TEMP('b')),
  MIR_CJUMP_FALLTHROUGH(MIR_TEMP(''), 'baz'),
  MIR_JUMP('baz'),
  MIR_LABEL('baz'),
  MIR_RETURN(HIR_ONE),
  MIR_RETURN(HIR_ONE),
];
const graph = ControlFlowGraph.fromMidIRStatements(statements);

it('Control flow graph should preserve order.', () => {
  expect(graph.nodes.map((it) => it.instruction)).toEqual(statements);
});

it('DFS should hit all the reachable statements.', () => {
  const visited = new Set<number>();
  graph.dfs((node) => {
    visited.add(node.id);
  });
  expect(Array.from(visited.values()).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

it('DFS should not be able to get to unreachable statements.', () => {
  graph.dfs((node) => {
    if (node.id === 7) {
      fail('We should not hit the final unreachable return.');
    }
  });
});

it('getParentIds is correct.', () => {
  const parentOf = (id: number) =>
    Array.from(graph.getParentIds(id).values()).sort((a, b) => a - b);
  expect(parentOf(0)).toEqual([]);
  expect(parentOf(1)).toEqual([0]);
  expect(parentOf(2)).toEqual([1]);
  expect(parentOf(3)).toEqual([2]);
  expect(parentOf(4)).toEqual([3]);
  expect(parentOf(5)).toEqual([3, 4]);
  expect(parentOf(6)).toEqual([5]);
});

it('Can construct CFG from assembly instructions', () => {
  ControlFlowGraph.fromAssemblyInstructions([
    ASM_JUMP('jmp', ''),
    ASM_LABEL(''),
    ASM_JUMP('jl', ''),
    ASM_RET,
  ]);
});
