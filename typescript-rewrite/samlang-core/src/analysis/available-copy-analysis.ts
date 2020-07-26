import type { MidIRStatement } from '../ast/mir';
import { Hashable, ReadonlyHashSet, hashSetOf, listShallowEquals } from '../util/collections';
import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runForwardDataflowAnalysis } from './dataflow-analysis';

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
  joinEdges: (parentOutEdges) => {
    const newInEdgeCopyMap = new Map<string, string>();
    // Conflicting means that we have a meet with a := foo, b := bar.
    const conflictingDestinationSet = new Set<string>();
    parentOutEdges.forEach((parentOutEdge) => {
      parentOutEdge.forEach(({ destination, source }) => {
        const existingSource = newInEdgeCopyMap.get(destination);
        if (existingSource == null) {
          newInEdgeCopyMap.set(destination, source);
        }
        if (existingSource != null && source !== existingSource) {
          conflictingDestinationSet.add(destination);
        }
      });
    });
    const newInCopySet = hashSetOf<AvailableCopy>();
    newInEdgeCopyMap.forEach((source, destination) => {
      if (!conflictingDestinationSet.has(destination)) {
        newInCopySet.add(COPY(destination, source));
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
    const rootDestinationSourceMapping: Record<string, string | undefined> = {};
    copies.forEach(({ destination, source }) => {
      let rootSource = source;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const moreRootSource = rootDestinationSourceMapping[rootSource];
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
