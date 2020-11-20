import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runForwardDataflowAnalysis } from './dataflow-analysis';

import {
  MidIRExpression,
  MidIRStatement,
  midIRExpressionToString,
} from 'samlang-core-ast/mir-nodes';
import {
  Hashable,
  ReadonlyHashMap,
  ReadonlyHashSet,
  HashSet,
  hashMapOf,
  hashSetOf,
  listShallowEquals,
  hashMapEquals,
  isNotNull,
  checkNotNull,
} from 'samlang-core-utils';

export class MidIRExpressionWrapper implements Hashable {
  constructor(public readonly expression: MidIRExpression) {}

  uniqueHash(): string {
    return midIRExpressionToString(this.expression);
  }
}

const collectSubExpressionsFromMidIRExpression = (
  set: HashSet<MidIRExpressionWrapper>,
  expression: MidIRExpression
): HashSet<MidIRExpressionWrapper> => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return set;
    case 'MidIRImmutableMemoryExpression':
      set.add(new MidIRExpressionWrapper(expression));
      collectSubExpressionsFromMidIRExpression(set, expression.indexExpression);
      return set;
    case 'MidIRBinaryExpression':
      set.add(new MidIRExpressionWrapper(expression));
      collectSubExpressionsFromMidIRExpression(set, expression.e1);
      collectSubExpressionsFromMidIRExpression(set, expression.e2);
      return set;
  }
};

const collectSubExpressionsFromMidIRStatement = (
  statement: MidIRStatement
): ReadonlyHashSet<MidIRExpressionWrapper> => {
  const set = hashSetOf<MidIRExpressionWrapper>();

  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return collectSubExpressionsFromMidIRExpression(set, statement.source);
    case 'MidIRMoveMemStatement':
      collectSubExpressionsFromMidIRExpression(set, statement.source);
      collectSubExpressionsFromMidIRExpression(set, statement.memoryIndexExpression);
      return set;
    case 'MidIRCallFunctionStatement':
      collectSubExpressionsFromMidIRExpression(set, statement.functionExpression);
      statement.functionArguments.forEach((it) =>
        collectSubExpressionsFromMidIRExpression(set, it)
      );
      return set;
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return set;
    case 'MidIRConditionalJumpFallThrough':
      return collectSubExpressionsFromMidIRExpression(set, statement.conditionExpression);
    case 'MidIRReturnStatement':
      if (statement.returnedExpression != null) {
        collectSubExpressionsFromMidIRExpression(set, statement.returnedExpression);
      }
      return set;
  }
};

/** String of expression => statement ids where the expression first appear. */
type AvailableExpressionToSourceMapping = ReadonlyHashMap<
  MidIRExpressionWrapper,
  readonly number[]
>;

const operator: DataflowAnalysisGraphOperator<
  MidIRStatement,
  AvailableExpressionToSourceMapping
> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => hashMapOf(),
  joinEdges: (parentOutEdges, nodeID) => {
    if (parentOutEdges.length === 0 || nodeID === 0) {
      return hashMapOf();
    }
    const newInEdgeMapping = hashMapOf<MidIRExpressionWrapper, number[]>();
    const otherParents = parentOutEdges.slice(1);
    checkNotNull(parentOutEdges[0]).forEach((statementIds, availableExpression) => {
      const appearIdsFromOtherParentsWithNull = otherParents.map((map) =>
        map.get(availableExpression)
      );
      const appearIdsFromOtherParents = appearIdsFromOtherParentsWithNull.filter(isNotNull);
      if (appearIdsFromOtherParents.length === appearIdsFromOtherParentsWithNull.length) {
        // Now we established that this `availableExpression` is indeed common.
        newInEdgeMapping.set(
          availableExpression,
          Array.from(new Set([...appearIdsFromOtherParents, statementIds].flat()))
        );
      }
    });
    return newInEdgeMapping;
  },
  computeNewEdge: (newInEdge, statement, nodeID) => {
    const newOutEdge = hashMapOf(...newInEdge.entries());
    collectSubExpressionsFromMidIRStatement(statement).forEach((availableExpression) => {
      // We do nothing if things are already there, because we want to keep the first appearance source.
      // It is safe to do because all temps will only be assigned once.
      if (!newOutEdge.has(availableExpression)) {
        newOutEdge.set(availableExpression, [nodeID]);
      }
    });
    return newOutEdge;
  },
  edgeDataEquals: (a, b) => hashMapEquals(a, b, listShallowEquals),
};

const analyzeAvailableExpressionsComingOutAtEachStatement = (
  statements: readonly MidIRStatement[]
): readonly AvailableExpressionToSourceMapping[] =>
  runForwardDataflowAnalysis(statements, operator).outEdges;

export default analyzeAvailableExpressionsComingOutAtEachStatement;
