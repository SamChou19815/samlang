import optimizeHighIRWhileStatementByLoopInvariantCodeMotion from '../hir-loop-invariant-code-motion';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_WHILE,
  HIR_BINARY,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_FUNCTION_CALL,
  HIR_INDEX_ACCESS,
  debugPrintHighIRStatement,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_IF_ELSE,
} from 'samlang-core-ast/hir-expressions';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('optimizeHighIRWhileStatementByLoopInvariantCodeMotion works', () => {
  const {
    hoistedStatementsBeforeWhile,
    optimizedWhileStatement,
    nonLoopInvariantVariables,
  } = optimizeHighIRWhileStatementByLoopInvariantCodeMotion(
    HIR_WHILE({
      loopVariables: [
        {
          name: 'i',
          type: HIR_INT_TYPE,
          initialValue: HIR_ZERO,
          loopValue: HIR_VARIABLE('tmp_i', HIR_INT_TYPE),
        },
        {
          name: 'j',
          type: HIR_INT_TYPE,
          initialValue: HIR_ZERO,
          loopValue: HIR_VARIABLE('tmp_j', HIR_INT_TYPE),
        },
        {
          name: 'x',
          type: HIR_INT_TYPE,
          initialValue: HIR_ZERO,
          loopValue: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
        },
        {
          name: 'y',
          type: HIR_INT_TYPE,
          initialValue: HIR_ZERO,
          loopValue: HIR_VARIABLE('tmp_y', HIR_INT_TYPE),
        },
        {
          name: 'z',
          type: HIR_INT_TYPE,
          initialValue: HIR_ZERO,
          loopValue: HIR_VARIABLE('tmp_z', HIR_INT_TYPE),
        },
      ],
      statements: [
        HIR_BINARY({
          name: 'cc',
          operator: '<',
          e1: HIR_VARIABLE('i', HIR_INT_TYPE),
          e2: HIR_ZERO,
        }),
        HIR_SINGLE_IF({
          booleanExpression: HIR_VARIABLE('cc', HIR_BOOL_TYPE),
          invertCondition: false,
          statements: [HIR_BREAK(HIR_ZERO)],
        }),
        HIR_BINARY({
          name: 'tmp_i',
          operator: '+',
          e1: HIR_VARIABLE('i', HIR_INT_TYPE),
          e2: HIR_ONE,
        }),
        HIR_BINARY({
          name: 'tmp_j',
          operator: '+',
          e1: HIR_VARIABLE('j', HIR_INT_TYPE),
          e2: HIR_INT(3),
        }),
        HIR_BINARY({
          name: 'tmp_x',
          operator: '*',
          e1: HIR_VARIABLE('i', HIR_INT_TYPE),
          e2: HIR_INT(5),
        }),
        HIR_BINARY({
          name: 'tmp_y',
          operator: '+',
          e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
          e2: HIR_INT(6),
        }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_ZERO,
          functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
          returnType: HIR_INT_TYPE,
        }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_ZERO,
          functionArguments: [HIR_VARIABLE('tmp_x', HIR_INT_TYPE)],
          returnType: HIR_INT_TYPE,
          returnCollector: 'fc',
        }),
        HIR_BINARY({
          name: 'tmp_z',
          operator: '+',
          e1: HIR_VARIABLE('tmp_x', HIR_INT_TYPE),
          e2: HIR_VARIABLE('tmp_y', HIR_INT_TYPE),
        }),
        HIR_BINARY({
          name: 'c',
          operator: '-',
          e1: HIR_VARIABLE('a', HIR_INT_TYPE),
          e2: HIR_VARIABLE('b', HIR_INT_TYPE),
        }),
        HIR_INDEX_ACCESS({
          name: 'd',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('c', HIR_INT_TYPE),
          index: 0,
        }),
        HIR_INDEX_ACCESS({
          name: 'e',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('x', HIR_INT_TYPE),
          index: 0,
        }),
        HIR_BINARY({
          name: 'f',
          operator: '+',
          e2: HIR_VARIABLE('b', HIR_INT_TYPE),
          e1: HIR_VARIABLE('x', HIR_INT_TYPE),
        }),
        HIR_CAST({
          name: 'g',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_VARIABLE('x', HIR_INT_TYPE),
        }),
        HIR_CAST({
          name: 'h',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_VARIABLE('d', HIR_INT_TYPE),
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: 'kk',
          type: HIR_INT_TYPE,
          expressionList: [HIR_ZERO],
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: 'kk2',
          type: HIR_INT_TYPE,
          expressionList: [HIR_VARIABLE('g', HIR_INT_TYPE)],
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [],
          s2: [],
          finalAssignments: [
            { name: 'bad', type: HIR_INT_TYPE, branch1Value: HIR_ZERO, branch2Value: HIR_ZERO },
          ],
        }),
        HIR_WHILE({ loopVariables: [], statements: [] }),
        HIR_WHILE({
          loopVariables: [],
          statements: [],
          breakCollector: { name: 'zzzz', type: HIR_INT_TYPE },
        }),
      ],
      breakCollector: { name: 'bc', type: HIR_INT_TYPE },
    })
  );

  const jointDebugPrint = [...hoistedStatementsBeforeWhile, optimizedWhileStatement]
    .map((it) => debugPrintHighIRStatement(it))
    .join('\n');
  expect(jointDebugPrint).toBe(`let c: int = (a: int) - (b: int);
let d: int = (c: int)[0];
let h: int = (d: int);
let kk: int = [0];
let i: int = 0;
let j: int = 0;
let x: int = 0;
let y: int = 0;
let z: int = 0;
let bc: int;
while (true) {
  let cc: bool = (i: int) < 0;
  if (cc: bool) {
    bc = 0;
    break;
  }
  let tmp_i: int = (i: int) + 1;
  let tmp_j: int = (j: int) + 3;
  let tmp_x: int = (i: int) * 5;
  let tmp_y: int = (tmp_x: int) + 6;
  0((tmp_x: int));
  let fc: int = 0((tmp_x: int));
  let tmp_z: int = (tmp_x: int) + (tmp_y: int);
  let e: int = (x: int)[0];
  let f: int = (x: int) + (b: int);
  let g: int = (x: int);
  let kk2: int = [(g: int)];
  let bad: int;
  if 0 {
    bad = 0;
  } else {
    bad = 0;
  }
  while (true) {
  }
  let zzzz: int;
  while (true) {
  }
  i = (tmp_i: int);
  j = (tmp_j: int);
  x = (tmp_x: int);
  y = (tmp_y: int);
  z = (tmp_z: int);
}`);
  expect(Array.from(nonLoopInvariantVariables).sort((a, b) => a.localeCompare(b))).toEqual([
    'bad',
    'cc',
    'e',
    'f',
    'fc',
    'g',
    'i',
    'j',
    'kk2',
    'tmp_i',
    'tmp_j',
    'tmp_x',
    'tmp_y',
    'tmp_z',
    'x',
    'y',
    'z',
    'zzzz',
  ]);
});
