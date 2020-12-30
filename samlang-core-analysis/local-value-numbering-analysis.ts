import ControlFlowGraph, { ControlFlowGraphNode } from './control-flow-graph';

import {
  MidIRTemporaryExpression,
  MidIRExpression,
  midIRExpressionToString,
  MIR_TEMP,
  MidIRStatement,
} from 'samlang-core-ast/mir-nodes';
import { assertNotNull } from 'samlang-core-utils';

class LocalNumberingAllocator {
  private id = 0;

  allocateNextID(): number {
    const id = this.id;
    this.id += 1;
    return id;
  }
}

export interface ReadonlyLocalNumberingInformation {
  getTemporaryReplacementForExpression(
    midIrExpression: MidIRExpression
  ): MidIRTemporaryExpression | null;
}

/** EXPOSED FOR TESTING. DO NOT RELY ON IMPLEMENTATION DETAIL. */
export class LocalNumberingInformation implements ReadonlyLocalNumberingInformation {
  constructor(
    readonly expressionToNumberMapping: Record<string, number>,
    readonly numberToTemporaryMapping: Record<number, string>
  ) {}

  copy(): LocalNumberingInformation {
    return new LocalNumberingInformation(
      { ...this.expressionToNumberMapping },
      { ...this.numberToTemporaryMapping }
    );
  }

  addExpressionToNumberBinding(
    allocator: LocalNumberingAllocator,
    midIrExpression: MidIRExpression
  ): void {
    const key = midIRExpressionToString(midIrExpression);
    if (this.expressionToNumberMapping[key] == null) {
      this.expressionToNumberMapping[key] = allocator.allocateNextID();
    }
  }

  addNumberToTemporaryBinding(number: number, nameOfTemporary: string): void {
    this.expressionToNumberMapping[midIRExpressionToString(MIR_TEMP(nameOfTemporary))] = number;
    this.numberToTemporaryMapping[number] = nameOfTemporary;
  }

  getTemporaryReplacementForExpression(
    midIrExpression: MidIRExpression
  ): MidIRTemporaryExpression | null {
    const number = this.expressionToNumberMapping[midIRExpressionToString(midIrExpression)];
    if (number == null) return null;
    const temporary = this.numberToTemporaryMapping[number];
    return temporary == null ? null : MIR_TEMP(temporary);
  }
}

const createNewLocalNumberingInformation = (
  oldLocalNumberingInformation: LocalNumberingInformation,
  allocator: LocalNumberingAllocator,
  statement: MidIRStatement
): LocalNumberingInformation => {
  const newMutableLocalNumberingInformation = oldLocalNumberingInformation.copy();

  const collectInformationFromAllSubExpressions = (expression: MidIRExpression): void => {
    switch (expression.__type__) {
      case 'MidIRConstantExpression':
      case 'MidIRNameExpression':
        return;
      case 'MidIRTemporaryExpression':
        newMutableLocalNumberingInformation.addExpressionToNumberBinding(allocator, expression);
        return;
      case 'MidIRImmutableMemoryExpression':
        collectInformationFromAllSubExpressions(expression.indexExpression);
        newMutableLocalNumberingInformation.addExpressionToNumberBinding(allocator, expression);
        return;
      case 'MidIRBinaryExpression':
        collectInformationFromAllSubExpressions(expression.e1);
        collectInformationFromAllSubExpressions(expression.e2);
        newMutableLocalNumberingInformation.addExpressionToNumberBinding(allocator, expression);
    }
  };

  switch (statement.__type__) {
    case 'MidIRMoveTempStatement': {
      const { temporaryID: destination, source } = statement;
      collectInformationFromAllSubExpressions(source);
      const sourceNumber =
        newMutableLocalNumberingInformation.expressionToNumberMapping[
          midIRExpressionToString(source)
        ];
      newMutableLocalNumberingInformation.addNumberToTemporaryBinding(
        sourceNumber ?? allocator.allocateNextID(),
        destination
      );
      break;
    }
    case 'MidIRMoveMemStatement':
      collectInformationFromAllSubExpressions(statement.source);
      collectInformationFromAllSubExpressions(statement.memoryIndexExpression);
      break;
    case 'MidIRCallFunctionStatement':
      collectInformationFromAllSubExpressions(statement.functionExpression);
      statement.functionArguments.forEach(collectInformationFromAllSubExpressions);
      if (statement.returnCollectorTemporaryID != null) {
        newMutableLocalNumberingInformation.addNumberToTemporaryBinding(
          allocator.allocateNextID(),
          statement.returnCollectorTemporaryID
        );
      }
      break;
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      break;
    case 'MidIRConditionalJumpFallThrough':
      collectInformationFromAllSubExpressions(statement.conditionExpression);
      break;
    case 'MidIRReturnStatement':
      if (statement.returnedExpression != null) {
        collectInformationFromAllSubExpressions(statement.returnedExpression);
      }
      break;
  }

  return newMutableLocalNumberingInformation;
};

class LocalValueNumberingAnalyzer {
  private readonly graph: ControlFlowGraph<MidIRStatement>;

  private readonly visited = new Set<number>();

  private readonly allocator = new LocalNumberingAllocator();

  readonly localNumberingInfoForAllStatements: LocalNumberingInformation[];

  constructor(statements: readonly MidIRStatement[]) {
    this.graph = ControlFlowGraph.fromMidIRStatements(statements);
    this.localNumberingInfoForAllStatements = new Array(statements.length);
    const workList = [this.graph.startNode];
    while (workList.length > 0) {
      const start = workList.shift();
      assertNotNull(start);
      this.dfs(start, true, new LocalNumberingInformation({}, {}), workList);
    }
  }

  private dfs(
    node: ControlFlowGraphNode<MidIRStatement>,
    isFirst: boolean,
    infoFlowingIn: LocalNumberingInformation,
    workList: ControlFlowGraphNode<MidIRStatement>[]
  ): void {
    const { id, instruction: statement } = node;
    if (this.visited.has(id)) {
      return;
    }
    if (!isFirst && this.graph.getParentIds(id).size > 1) {
      // Multiple entry points, not a good start.
      // This is the hack we use to do numbering on a basic block level without basic block.
      // By stopping at the node where there are two parents, we stop at basic block boundaries.
      workList.push(node);
      return;
    }
    this.visited.add(id);
    this.localNumberingInfoForAllStatements[id] = infoFlowingIn;
    const newLocalNumberingInformation = createNewLocalNumberingInformation(
      infoFlowingIn,
      this.allocator,
      statement
    );
    this.graph
      .getChildren(id)
      .forEach((childNode) => this.dfs(childNode, false, newLocalNumberingInformation, workList));
  }
}

const analyzeLocalValueNumberingAssignment = (
  statements: readonly MidIRStatement[]
): readonly ReadonlyLocalNumberingInformation[] =>
  new LocalValueNumberingAnalyzer(statements).localNumberingInfoForAllStatements;

export default analyzeLocalValueNumberingAssignment;
