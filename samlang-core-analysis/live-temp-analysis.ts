import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runBackwardDataflowAnalysis } from './dataflow-analysis';

import type { MidIRExpression, MidIRStatement } from 'samlang-core-ast/mir-nodes';
import { setEquals } from 'samlang-core-utils';

const collectUsesFromMidIRExpression = (
  uses: Set<string>,
  expression: MidIRExpression
): Set<string> => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
      return uses;
    case 'MidIRTemporaryExpression':
      uses.add(expression.name);
      return uses;
    case 'MidIRImmutableMemoryExpression':
      collectUsesFromMidIRExpression(uses, expression.indexExpression);
      return uses;
    case 'MidIRBinaryExpression':
      collectUsesFromMidIRExpression(uses, expression.e1);
      collectUsesFromMidIRExpression(uses, expression.e2);
      return uses;
  }
};

const collectDefAndUsesFromMidIRStatement = (
  statement: MidIRStatement
): { readonly uses: ReadonlySet<string>; readonly def?: string } => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return {
        uses: collectUsesFromMidIRExpression(new Set(), statement.source),
        def: statement.temporaryID,
      };
    case 'MidIRMoveMemStatement':
      return {
        uses: collectUsesFromMidIRExpression(
          collectUsesFromMidIRExpression(new Set(), statement.memoryIndexExpression),
          statement.source
        ),
      };
    case 'MidIRCallFunctionStatement': {
      const uses = new Set<string>();
      collectUsesFromMidIRExpression(uses, statement.functionExpression);
      statement.functionArguments.forEach((it) => collectUsesFromMidIRExpression(uses, it));
      return { uses, def: statement.returnCollectorTemporaryID };
    }
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return { uses: new Set() };
    case 'MidIRConditionalJumpFallThrough':
      return { uses: collectUsesFromMidIRExpression(new Set(), statement.conditionExpression) };
    case 'MidIRReturnStatement':
      return { uses: collectUsesFromMidIRExpression(new Set(), statement.returnedExpression) };
  }
};

const operator: DataflowAnalysisGraphOperator<MidIRStatement, Set<string>> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => new Set(),
  joinEdges: (parentInEdges) => {
    const newOutEdge = new Set<string>();
    parentInEdges.forEach((edge) => edge.forEach((v) => newOutEdge.add(v)));
    return newOutEdge;
  },
  computeNewEdge: (newOutEdge, statement) => {
    const newInEdge = new Set(newOutEdge);
    const { uses, def } = collectDefAndUsesFromMidIRStatement(statement);
    if (def != null) {
      newInEdge.delete(def);
    }
    uses.forEach((oneUse) => newInEdge.add(oneUse));
    return newInEdge;
  },
  edgeDataEquals: setEquals,
};

const analyzeLiveTemporariesAtTheEndOfEachStatement = (
  statements: readonly MidIRStatement[]
): readonly ReadonlySet<string>[] => runBackwardDataflowAnalysis(statements, operator).outEdges;

export default analyzeLiveTemporariesAtTheEndOfEachStatement;
