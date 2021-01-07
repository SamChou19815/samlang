import ControlFlowGraph from '../control-flow-graph';
import {
  DataflowAnalysisGraphOperator,
  runBackwardDataflowAnalysis,
  runForwardDataflowAnalysis,
} from '../dataflow-analysis';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRStatement,
  MIR_MOVE_TEMP,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const exampleProgram: readonly MidIRStatement[] = [
  /* 00 */ MIR_MOVE_TEMP('x', HIR_ONE),
  /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), HIR_INT(2)), 'true'),
  /* 02 */ MIR_CALL_FUNCTION(HIR_ONE, [], 'y'),
  /* 03 */ MIR_MOVE_TEMP('z1', MIR_OP('+', HIR_ONE, HIR_ZERO)),
  /* 04 */ MIR_MOVE_TEMP('z2', MIR_OP('!=', HIR_ONE, HIR_ZERO)),
  /* 05 */ MIR_JUMP('end'),
  /* 06 */ MIR_MOVE_TEMP('unreachable_statement', HIR_ONE),
  /* 07 */ MIR_LABEL('true'),
  /* 08 */ MIR_MOVE_TEMP('y', MIR_OP('+', HIR_ONE, MIR_TEMP('x'))),
  /* 09 */ MIR_MOVE_TEMP('z1', MIR_OP('*', HIR_ONE, HIR_ONE)),
  /* 10 */ MIR_MOVE_TEMP('z2', MIR_OP('/', HIR_ONE, HIR_ZERO)),
  /* 11 */ MIR_LABEL('end'),
  /* 12 */ MIR_MOVE_TEMP('a', MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('y'))),
  /* 13 */ MIR_RETURN(HIR_ONE),
  /* 14 */ MIR_RETURN(HIR_ONE),
];

/**
 * This operator only does one thing: make every node `true` (aka visited.),
 * except potentially the entry point.
 */
const commonOperator: DataflowAnalysisGraphOperator<MidIRStatement, boolean> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => false,
  joinEdges: (edges) => edges.some((it) => it),
  computeNewEdge: () => true,
  edgeDataEquals: (a, b) => a === b,
};

it('backward analysis runner test.', () => {
  expect(runBackwardDataflowAnalysis(exampleProgram, commonOperator)).toEqual({
    inEdges: (() => {
      const result = Array.from(new Array(15).keys()).map(() => true);
      result[14] = false;
      return result;
    })(),
    outEdges: (() => {
      const result = Array.from(new Array(15).keys()).map(() => true);
      result[13] = false;
      result[14] = false;
      return result;
    })(),
  });
});

it('forward analysis runner test.', () => {
  expect(runForwardDataflowAnalysis(exampleProgram, commonOperator)).toEqual({
    inEdges: [
      /* 00 */ false,
      /* 01 */ true,
      /* 02 */ true,
      /* 03 */ true,
      /* 04 */ true,
      /* 05 */ true,
      /* 06 */ false,
      /* 07 */ true,
      /* 08 */ true,
      /* 09 */ true,
      /* 10 */ true,
      /* 11 */ true,
      /* 12 */ true,
      /* 13 */ true,
      /* 14 */ false,
    ],
    outEdges: [
      /* 00 */ true,
      /* 01 */ true,
      /* 02 */ true,
      /* 03 */ true,
      /* 04 */ true,
      /* 05 */ true,
      /* 06 */ false,
      /* 07 */ true,
      /* 08 */ true,
      /* 09 */ true,
      /* 10 */ true,
      /* 11 */ true,
      /* 12 */ true,
      /* 13 */ true,
      /* 14 */ false,
    ],
  });
});
