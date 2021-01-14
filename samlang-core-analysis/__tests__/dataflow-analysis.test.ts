import ControlFlowGraph from '../control-flow-graph';
import {
  DataflowAnalysisGraphOperator,
  runBackwardDataflowAnalysis,
  runForwardDataflowAnalysis,
} from '../dataflow-analysis';

import {
  LLVMInstruction,
  LLVM_INT,
  LLVM_VARIABLE,
  LLVM_BINARY,
  LLVM_CAST,
  LLVM_CALL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_LABEL,
  LLVM_RETURN,
  LLVM_INT_TYPE,
} from 'samlang-core-ast/llvm-nodes';

const ZERO = LLVM_INT(0);
const ONE = LLVM_INT(1);

const exampleProgram: readonly LLVMInstruction[] = [
  /* 00 */ LLVM_CAST({
    resultVariable: 'x',
    resultType: LLVM_INT_TYPE,
    sourceValue: ONE,
    sourceType: LLVM_INT_TYPE,
  }),
  /* 01 */ LLVM_CJUMP(LLVM_VARIABLE('x'), 'fall', 'true'),
  /* 02 */ LLVM_LABEL('fall'),
  /* 03 */ LLVM_CALL({
    functionName: ONE,
    functionArguments: [],
    resultType: LLVM_INT_TYPE,
    resultVariable: 'y',
  }),
  /* 04 */ LLVM_BINARY({
    resultVariable: 'z1',
    operandType: LLVM_INT_TYPE,
    operator: '+',
    v1: ONE,
    v2: ZERO,
  }),
  /* 05 */ LLVM_BINARY({
    resultVariable: 'z2',
    operandType: LLVM_INT_TYPE,
    operator: '!=',
    v1: ONE,
    v2: ZERO,
  }),
  /* 06 */ LLVM_JUMP('end'),
  /* 07 */ LLVM_CAST({
    resultVariable: 'unreachable_statement',
    resultType: LLVM_INT_TYPE,
    sourceValue: ONE,
    sourceType: LLVM_INT_TYPE,
  }),
  /* 08 */ LLVM_LABEL('true'),
  /* 09 */ LLVM_BINARY({
    resultVariable: 'y',
    operandType: LLVM_INT_TYPE,
    operator: '+',
    v1: ONE,
    v2: LLVM_VARIABLE('x'),
  }),
  /* 10 */ LLVM_BINARY({
    resultVariable: 'z1',
    operandType: LLVM_INT_TYPE,
    operator: '*',
    v1: ONE,
    v2: ONE,
  }),
  /* 11 */ LLVM_BINARY({
    resultVariable: 'z2',
    operandType: LLVM_INT_TYPE,
    operator: '/',
    v1: ONE,
    v2: ZERO,
  }),
  /* 12 */ LLVM_JUMP('end'),
  /* 13 */ LLVM_LABEL('end'),
  /* 14 */ LLVM_BINARY({
    resultVariable: 'a',
    operandType: LLVM_INT_TYPE,
    operator: '!=',
    v1: LLVM_VARIABLE('y'),
    v2: LLVM_VARIABLE('y'),
  }),
  /* 15 */ LLVM_RETURN(ONE, LLVM_INT_TYPE),
  /* 16 */ LLVM_RETURN(ONE, LLVM_INT_TYPE),
];

/**
 * This operator only does one thing: make every node `true` (aka visited.),
 * except potentially the entry point.
 */
const commonOperator: DataflowAnalysisGraphOperator<LLVMInstruction, boolean> = {
  graphConstructor: ControlFlowGraph.fromLLVMInstructions,
  edgeInitializer: () => false,
  joinEdges: (edges) => edges.some((it) => it),
  computeNewEdge: () => true,
  edgeDataEquals: (a, b) => a === b,
};

it('backward analysis runner test.', () => {
  expect(runBackwardDataflowAnalysis(exampleProgram, commonOperator)).toEqual({
    inEdges: (() => {
      const result = Array.from(new Array(17).keys()).map(() => true);
      result[16] = false;
      return result;
    })(),
    outEdges: (() => {
      const result = Array.from(new Array(17).keys()).map(() => true);
      result[15] = false;
      result[16] = false;
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
      /* 06 */ true,
      /* 07 */ false,
      /* 08 */ true,
      /* 09 */ true,
      /* 10 */ true,
      /* 11 */ true,
      /* 12 */ true,
      /* 13 */ true,
      /* 14 */ true,
      /* 15 */ true,
      /* 16 */ false,
    ],
    outEdges: [
      /* 00 */ true,
      /* 01 */ true,
      /* 02 */ true,
      /* 03 */ true,
      /* 04 */ true,
      /* 05 */ true,
      /* 06 */ true,
      /* 07 */ false,
      /* 08 */ true,
      /* 09 */ true,
      /* 10 */ true,
      /* 11 */ true,
      /* 12 */ true,
      /* 13 */ true,
      /* 14 */ true,
      /* 15 */ true,
      /* 16 */ false,
    ],
  });
});
