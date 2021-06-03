/* eslint-disable no-param-reassign */

import { checkNotNull } from 'samlang-core-utils';

import type ControlFlowGraph from './control-flow-graph';

/** Defines how to compute stuff on the graph. */
export interface DataflowAnalysisGraphOperator<Instruction, DataEdge> {
  graphConstructor: (instructions: readonly Instruction[]) => ControlFlowGraph<Instruction>;
  edgeInitializer: (index: number) => DataEdge;
  joinEdges: (edges: readonly DataEdge[], currentNodeID: number) => DataEdge;
  computeNewEdge: (
    newEdgeOnTheOtherSide: DataEdge,
    instruction: Instruction,
    nodeID: number
  ) => DataEdge;
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
  const nodesStack: number[] = [];
  for (let i = 0; i < len; i += 1) {
    inEdges[i] = edgeInitializer(i);
    outEdges[i] = edgeInitializer(i);
  }
  const graph = graphConstructor(instructions);
  graph.dfs((node) => {
    nodesStack.push(node.id);
  });

  while (nodesStack.length > 0) {
    const nodeId = checkNotNull(nodesStack.pop());
    const newOutEdge = joinEdges(
      graph.getChildrenIds(nodeId).map((childId) => checkNotNull(inEdges[childId])),
      nodeId
    );
    outEdges[nodeId] = newOutEdge;
    const oldInEdge = checkNotNull(inEdges[nodeId]);
    const newInEdge = computeNewEdge(newOutEdge, checkNotNull(instructions[nodeId]), nodeId);
    inEdges[nodeId] = newInEdge;
    if (!edgeDataEquals(oldInEdge, newInEdge)) {
      nodesStack.push(...graph.getParentIds(nodeId));
    }
  }

  return { inEdges, outEdges };
};

export const runForwardDataflowAnalysis = <Instruction, DataEdge>(
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
  const nodesQueue: number[] = [];
  for (let i = 0; i < len; i += 1) {
    inEdges[i] = edgeInitializer(i);
    outEdges[i] = edgeInitializer(i);
  }
  const graph = graphConstructor(instructions);
  graph.dfs((node) => {
    nodesQueue.push(node.id);
  });

  while (nodesQueue.length > 0) {
    const nodeId = checkNotNull(nodesQueue.shift());
    const newInEdge = joinEdges(
      Array.from(graph.getParentIds(nodeId)).map((parentId) => checkNotNull(outEdges[parentId])),
      nodeId
    );
    inEdges[nodeId] = newInEdge;
    const oldOutEdge = checkNotNull(outEdges[nodeId]);
    const newOutEdge = computeNewEdge(newInEdge, checkNotNull(instructions[nodeId]), nodeId);
    outEdges[nodeId] = newOutEdge;
    if (!edgeDataEquals(oldOutEdge, newOutEdge)) {
      nodesQueue.push(...graph.getChildrenIds(nodeId));
    }
  }

  return { inEdges, outEdges };
};
