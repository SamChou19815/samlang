import { MidIRExpression, MidIRStatement, midIRExpressionToString } from '../ast/mir';
import { mapEquals } from '../util/collections';
import { isNotNull } from '../util/type-assertions';
import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runForwardDataflowAnalysis } from './dataflow-analysis';

const collectSubExpressionsFromMidIRExpression = (
  set: Set<string>,
  expression: MidIRExpression
): Set<string> => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return set;
    case 'MidIRImmutableMemoryExpression':
      set.add(midIRExpressionToString(expression));
      collectSubExpressionsFromMidIRExpression(set, expression.indexExpression);
      return set;
    case 'MidIRBinaryExpression':
      set.add(midIRExpressionToString(expression));
      collectSubExpressionsFromMidIRExpression(set, expression.e1);
      collectSubExpressionsFromMidIRExpression(set, expression.e2);
      return set;
  }
};

const collectSubExpressionsFromMidIRStatement = (
  statement: MidIRStatement
): ReadonlySet<string> => {
  const set = new Set<string>();

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
type AvailableExpressionToSourceMapping = ReadonlyMap<string, readonly number[]>;

const operator: DataflowAnalysisGraphOperator<
  MidIRStatement,
  AvailableExpressionToSourceMapping
> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => new Map(),
  joinEdges: (parentOutEdges) => {
    if (parentOutEdges.length === 0) {
      return new Map();
    }
    const newInEdgeMapping = new Map<string, number[]>();
    const otherParents = parentOutEdges.slice(1);
    parentOutEdges[0].forEach((statementIds, availableExpression) => {
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
    const newOutEdge = new Map(newInEdge);
    collectSubExpressionsFromMidIRStatement(statement).forEach((availableExpression) => {
      // We do nothing if things are already there, because we want to keep the first appearance source.
      // It is safe to do because all temps will only be assigned once.
      if (!newOutEdge.has(availableExpression)) {
        newOutEdge.set(availableExpression, [nodeID]);
      }
    });
    return newOutEdge;
  },
  edgeDataEquals: (a, b) => mapEquals(a, b),
};

const analyzeAvailableExpressionsComingOutAtEachStatement = (
  statements: readonly MidIRStatement[]
): readonly AvailableExpressionToSourceMapping[] =>
  runForwardDataflowAnalysis(statements, operator).outEdges;

export default analyzeAvailableExpressionsComingOutAtEachStatement;
