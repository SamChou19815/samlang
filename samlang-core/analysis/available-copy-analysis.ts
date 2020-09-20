import type { MidIRStatement } from '../ast/mir-nodes';
import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runForwardDataflowAnalysis } from './dataflow-analysis';

import { Hashable, ReadonlyHashSet, hashSetOf, listShallowEquals } from 'samlang-core-utils';

class AvailableCopy implements Hashable {
  constructor(readonly destination: string, readonly source: string) {}

  uniqueHash(): string {
    return `${this.destination}::${this.source}`;
  }
}

const COPY = (destination: string, source: string): AvailableCopy =>
  new AvailableCopy(destination, source);

const operator: DataflowAnalysisGraphOperator<MidIRStatement, ReadonlyHashSet<AvailableCopy>> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => hashSetOf(),
  joinEdges: (parentOutEdges, nodeID) => {
    if (parentOutEdges.length === 0 || nodeID === 0) {
      return hashSetOf();
    }
    const newInEdgeCopyMap = new Map<string, string>();
    // Conflicting means that we have a meet with a := foo, b := bar.
    const conflictingDestinationSet = new Set<string>();
    parentOutEdges.forEach((parentOutEdge) => {
      parentOutEdge.forEach(({ destination, source }) => {
        const existingSource = newInEdgeCopyMap.get(destination);
        if (existingSource == null) {
          newInEdgeCopyMap.set(destination, source);
          return;
        }
        if (existingSource != null && source === existingSource) {
          // Not conflicting.
          return;
        }
        conflictingDestinationSet.add(destination);
      });
    });
    const otherParentOutEdges = parentOutEdges.slice(1);
    const newInCopySet = hashSetOf<AvailableCopy>();
    parentOutEdges[0].forEach((copy) => {
      if (
        otherParentOutEdges.every((edge) => edge.has(copy)) &&
        !conflictingDestinationSet.has(copy.destination)
      ) {
        newInCopySet.add(copy);
      }
    });
    return newInCopySet;
  },
  computeNewEdge: (newInEdge, statement) => {
    switch (statement.__type__) {
      case 'MidIRMoveMemStatement':
      case 'MidIRJumpStatement':
      case 'MidIRLabelStatement':
      case 'MidIRConditionalJumpFallThrough':
      case 'MidIRReturnStatement':
        return newInEdge;
      case 'MidIRMoveTempStatement': {
        const { temporaryID, source } = statement;
        const newOutEdge = hashSetOf<AvailableCopy>();
        newInEdge.forEach((copy) => {
          if (copy.destination === temporaryID || copy.source === temporaryID) {
            return;
          }
          newOutEdge.add(copy);
        });
        if (source.__type__ === 'MidIRTemporaryExpression') {
          newOutEdge.add(COPY(temporaryID, source.temporaryID));
        }
        return newOutEdge;
      }
      case 'MidIRCallFunctionStatement': {
        const assigned = statement.returnCollectorTemporaryID;
        if (assigned == null) {
          return newInEdge;
        }
        const newOutEdge = hashSetOf<AvailableCopy>();
        newInEdge.forEach((copy) => {
          if (copy.destination === assigned || copy.source === assigned) {
            return;
          }
          newOutEdge.add(copy);
        });
        return newOutEdge;
      }
    }
  },
  edgeDataEquals: (a, b) =>
    listShallowEquals(
      a
        .toArray()
        .map((it) => it.uniqueHash())
        .sort((e1, e2) => e1.localeCompare(e2)),
      b
        .toArray()
        .map((it) => it.uniqueHash())
        .sort((e1, e2) => e1.localeCompare(e2))
    ),
};

const analyzeAvailableCopies = (
  statements: readonly MidIRStatement[]
): readonly Readonly<Record<string, string | undefined>>[] =>
  runForwardDataflowAnalysis(statements, operator).inEdges.map((copies) => {
    const tempMapping = new Map(copies.toArray().map((it) => [it.destination, it.source]));
    const rootDestinationSourceMapping: Record<string, string | undefined> = {};
    copies.forEach(({ destination }) => {
      let rootSource = destination;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const moreRootSource = tempMapping.get(rootSource);
        if (moreRootSource == null) {
          break;
        }
        rootSource = moreRootSource;
      }
      rootDestinationSourceMapping[destination] = rootSource;
    });
    return rootDestinationSourceMapping;
  });

export default analyzeAvailableCopies;
