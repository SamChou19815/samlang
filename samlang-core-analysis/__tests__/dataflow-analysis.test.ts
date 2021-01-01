import ControlFlowGraph from '../control-flow-graph';
import {
  DataflowAnalysisGraphOperator,
  runBackwardDataflowAnalysis,
  runForwardDataflowAnalysis,
} from '../dataflow-analysis';

import {
  MidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_CONST,
  MIR_TEMP,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const exampleProgram: readonly MidIRStatement[] = [
  /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
  /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_CONST(2)), 'true'),
  /* 02 */ MIR_CALL_FUNCTION('f', [], 'y'),
  /* 03 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('+', MIR_ONE, MIR_ZERO)),
  /* 04 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('!=', MIR_ONE, MIR_ZERO)),
  /* 05 */ MIR_JUMP('end'),
  /* 06 */ MIR_MOVE_TEMP(MIR_TEMP('unreachable_statement'), MIR_ONE),
  /* 07 */ MIR_LABEL('true'),
  /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
  /* 09 */ MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('*', MIR_ONE, MIR_ONE)),
  /* 10 */ MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('/', MIR_ONE, MIR_ZERO)),
  /* 11 */ MIR_LABEL('end'),
  /* 12 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('y'))),
  /* 13 */ MIR_RETURN(),
  /* 14 */ MIR_RETURN(),
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
