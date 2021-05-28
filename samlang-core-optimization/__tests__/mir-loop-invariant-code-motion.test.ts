import optimizeMidIRWhileStatementByLoopInvariantCodeMotion from '../mir-loop-invariant-code-motion';

import {
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_WHILE,
  MIR_BINARY,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_FUNCTION_CALL,
  MIR_INDEX_ACCESS,
  debugPrintMidIRStatement,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_IF_ELSE,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

it('optimizeMidIRWhileStatementByLoopInvariantCodeMotion works', () => {
  const { hoistedStatementsBeforeWhile, optimizedWhileStatement, nonLoopInvariantVariables } =
    optimizeMidIRWhileStatementByLoopInvariantCodeMotion(
      MIR_WHILE({
        loopVariables: [
          {
            name: 'i',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_i', MIR_INT_TYPE),
          },
          {
            name: 'j',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_j', MIR_INT_TYPE),
          },
          {
            name: 'x',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
          },
          {
            name: 'y',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_y', MIR_INT_TYPE),
          },
          {
            name: 'z',
            type: MIR_INT_TYPE,
            initialValue: MIR_ZERO,
            loopValue: MIR_VARIABLE('tmp_z', MIR_INT_TYPE),
          },
        ],
        statements: [
          MIR_BINARY({
            name: 'cc',
            operator: '<',
            e1: MIR_VARIABLE('i', MIR_INT_TYPE),
            e2: MIR_ZERO,
          }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('cc', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
          MIR_BINARY({
            name: 'tmp_i',
            operator: '+',
            e1: MIR_VARIABLE('i', MIR_INT_TYPE),
            e2: MIR_ONE,
          }),
          MIR_BINARY({
            name: 'tmp_j',
            operator: '+',
            e1: MIR_VARIABLE('j', MIR_INT_TYPE),
            e2: MIR_INT(3),
          }),
          MIR_BINARY({
            name: 'tmp_x',
            operator: '*',
            e1: MIR_VARIABLE('i', MIR_INT_TYPE),
            e2: MIR_INT(5),
          }),
          MIR_BINARY({
            name: 'tmp_y',
            operator: '+',
            e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
            e2: MIR_INT(6),
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_ZERO,
            functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_ZERO,
            functionArguments: [MIR_VARIABLE('tmp_x', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
            returnCollector: 'fc',
          }),
          MIR_BINARY({
            name: 'tmp_z',
            operator: '+',
            e1: MIR_VARIABLE('tmp_x', MIR_INT_TYPE),
            e2: MIR_VARIABLE('tmp_y', MIR_INT_TYPE),
          }),
          MIR_BINARY({
            name: 'c',
            operator: '-',
            e1: MIR_VARIABLE('a', MIR_INT_TYPE),
            e2: MIR_VARIABLE('b', MIR_INT_TYPE),
          }),
          MIR_INDEX_ACCESS({
            name: 'd',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('c', MIR_INT_TYPE),
            index: 0,
          }),
          MIR_INDEX_ACCESS({
            name: 'e',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('x', MIR_INT_TYPE),
            index: 0,
          }),
          MIR_BINARY({
            name: 'f',
            operator: '+',
            e2: MIR_VARIABLE('b', MIR_INT_TYPE),
            e1: MIR_VARIABLE('x', MIR_INT_TYPE),
          }),
          MIR_CAST({
            name: 'g',
            type: MIR_INT_TYPE,
            assignedExpression: MIR_VARIABLE('x', MIR_INT_TYPE),
          }),
          MIR_CAST({
            name: 'h',
            type: MIR_INT_TYPE,
            assignedExpression: MIR_VARIABLE('d', MIR_INT_TYPE),
          }),
          MIR_STRUCT_INITIALIZATION({
            structVariableName: 'kk',
            type: MIR_INT_TYPE,
            expressionList: [MIR_ZERO],
          }),
          MIR_STRUCT_INITIALIZATION({
            structVariableName: 'kk2',
            type: MIR_INT_TYPE,
            expressionList: [MIR_VARIABLE('g', MIR_INT_TYPE)],
          }),
          MIR_IF_ELSE({
            booleanExpression: MIR_ZERO,
            s1: [],
            s2: [],
            finalAssignments: [
              { name: 'bad', type: MIR_INT_TYPE, branch1Value: MIR_ZERO, branch2Value: MIR_ZERO },
            ],
          }),
          MIR_WHILE({ loopVariables: [], statements: [] }),
          MIR_WHILE({
            loopVariables: [],
            statements: [],
            breakCollector: { name: 'zzzz', type: MIR_INT_TYPE },
          }),
        ],
        breakCollector: { name: 'bc', type: MIR_INT_TYPE },
      })
    );

  const jointDebugPrint = [...hoistedStatementsBeforeWhile, optimizedWhileStatement]
    .map((it) => debugPrintMidIRStatement(it))
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
