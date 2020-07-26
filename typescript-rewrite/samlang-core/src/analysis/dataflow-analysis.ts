/* eslint-disable no-param-reassign */

import { assertNotNull } from '../util/type-assertions';
import type ControlFlowGraph from './control-flow-graph';

/** Defines how to compute stuff on tha graph. */
export interface DataflowAnalysisGraphOperator<Instruction, DataEdge> {
  graphConstructor: (instructions: readonly Instruction[]) => ControlFlowGraph<Instruction>;
  edgeInitializer: (index: number) => DataEdge;
  joinEdges: (edges: readonly DataEdge[]) => DataEdge;
  computeNewEdge: (oldInEdge: DataEdge, instruction: Instruction) => DataEdge;
  edgeDataEquals: (e1: DataEdge, e2: DataEdge) => boolean;
}

export const runBackwardDataflowAnalysis = <Instruction, DataEdge>(
  instructions: readonly Instruction[],
  {
    graphConstructor,
    edgeInitializer,
    joinEdges,
    computeNewEdge,
    edgeDataEquals,
  }: DataflowAnalysisGraphOperator<Instruction, DataEdge>
): { readonly inEdges: readonly DataEdge[]; readonly outEdges: readonly DataEdge[] } => {
  const len = instructions.length;
  const inEdges = new Array<DataEdge>(len);
  const outEdges = new Array<DataEdge>(len);
  const nodesStack = new Array<number>(len);
  for (let i = 0; i < len; i += 1) {
    inEdges[i] = edgeInitializer(i);
    outEdges[i] = edgeInitializer(i);
    nodesStack[i] = i;
  }
  const graph = graphConstructor(instructions);

  while (nodesStack.length > 0) {
    const nodeId = nodesStack.pop();
    assertNotNull(nodeId);
    const newOutEdge = joinEdges(graph.getChildrenIds(nodeId).map((childId) => inEdges[childId]));
    outEdges[nodeId] = newOutEdge;
    const oldInEdge = inEdges[nodeId];
    const newInEdge = computeNewEdge(oldInEdge, instructions[nodeId]);
    inEdges[nodeId] = newInEdge;
    if (!edgeDataEquals(oldInEdge, newInEdge)) {
      nodesStack.push(...graph.getParentIds(nodeId));
    }
  }

  return { inEdges, outEdges };
};
