import { MidIRExpression, MidIRStatement, midIRExpressionToString } from '../ast/mir';
import { mapEquals } from '../util/collections';
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

/** String of expression => statement id where the expression first appear. */
type AvailableExpressionToSourceMapping = ReadonlyMap<string, number>;

const operator: DataflowAnalysisGraphOperator<
  MidIRStatement,
  AvailableExpressionToSourceMapping
> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => new Map(),
  joinEdges: (parentOutEdges) => {
    const newInEdgeMapping = new Map<string, number>();
    const conflictingSourceExpressionSet = new Set<string>();
    parentOutEdges.forEach((parentOutEdge) => {
      parentOutEdge.forEach((statementId, availableExpression) => {
        const existingStatementId = newInEdgeMapping.get(availableExpression);
        if (existingStatementId == null) {
          newInEdgeMapping.set(availableExpression, statementId);
        }
        if (existingStatementId != null && statementId !== existingStatementId) {
          conflictingSourceExpressionSet.add(availableExpression);
        }
      });
    });
    conflictingSourceExpressionSet.forEach((expressionWithConflictingSource) =>
      newInEdgeMapping.delete(expressionWithConflictingSource)
    );
    return newInEdgeMapping;
  },
  computeNewEdge: (newInEdge, statement, nodeID) => {
    const newOutEdge = new Map(newInEdge);
    collectSubExpressionsFromMidIRStatement(statement).forEach((availableExpression) => {
      if (!newOutEdge.has(availableExpression)) {
        newOutEdge.set(availableExpression, nodeID);
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
