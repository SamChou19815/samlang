import optimizeMidIRFunctionByLocalValueNumbering from '../mir-local-value-numbering-optimization';

import {
  MidIRExpression,
  MidIRStatement,
  debugPrintMidIRExpression,
  debugPrintMidIRStatement,
  MIR_FALSE,
  MIR_TRUE,
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_INDEX_ACCESS,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_WHILE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

const assertCorrectlyOptimized = (
  statements: MidIRStatement[],
  returnValue: MidIRExpression,
  expected: string
): void => {
  const { body, returnValue: optimizedReturnValue } = optimizeMidIRFunctionByLocalValueNumbering({
    name: '',
    parameters: [],
    type: { __type__: 'FunctionType', argumentTypes: [], returnType: MIR_INT_TYPE },
    body: statements,
    returnValue,
  });

  expect(
    `${body.map((it) => debugPrintMidIRStatement(it)).join('\n')}\n` +
      `return ${debugPrintMidIRExpression(optimizedReturnValue)};`
  ).toBe(expected);
};

it('optimizeMidIRStatementsByLocalValueNumbering works on a series of simple statements', () => {
  assertCorrectlyOptimized(
    [
      MIR_INDEX_ACCESS({
        name: 'i0',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
        index: 2,
      }),
      MIR_INDEX_ACCESS({
        name: 'i1',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
        index: 2,
      }),
      MIR_BINARY({
        name: 'b0',
        operator: '+',
        e1: MIR_VARIABLE('i1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
      MIR_BINARY({
        name: 'b1',
        operator: '+',
        e1: MIR_VARIABLE('i0', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
      MIR_BINARY({
        name: 'b3',
        operator: '+',
        e1: MIR_VARIABLE('i1', MIR_INT_TYPE),
        e2: MIR_VARIABLE('b1', MIR_INT_TYPE),
      }),
      MIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: MIR_INT_TYPE,
        expressionList: [
          MIR_VARIABLE('i1', MIR_INT_TYPE),
          MIR_VARIABLE('b1', MIR_INT_TYPE),
          MIR_VARIABLE('b3', MIR_INT_TYPE),
        ],
      }),
      MIR_FUNCTION_CALL({
        functionExpression: MIR_NAME('fff', MIR_INT_TYPE),
        functionArguments: [
          MIR_VARIABLE('i1', MIR_INT_TYPE),
          MIR_VARIABLE('b1', MIR_INT_TYPE),
          MIR_VARIABLE('b3', MIR_INT_TYPE),
        ],
        returnType: MIR_INT_TYPE,
      }),
      MIR_CAST({
        name: 'ss',
        type: MIR_INT_TYPE,
        assignedExpression: MIR_VARIABLE('b3', MIR_INT_TYPE),
      }),
    ],
    MIR_VARIABLE('ss', MIR_INT_TYPE),
    `let i0: int = (a: int)[2];
let b0: int = (i0: int) + 3;
let b3: int = (i0: int) + (b0: int);
let s: int = [(i0: int), (b0: int), (b3: int)];
fff((i0: int), (b0: int), (b3: int));
let ss: int = (b3: int);
return (ss: int);`
  );
});

it('optimizeMidIRStatementsByLocalValueNumbering works on if-else 1/n', () => {
  assertCorrectlyOptimized(
    [
      MIR_INDEX_ACCESS({
        name: 'i0',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
        index: 2,
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [
          MIR_INDEX_ACCESS({
            name: 'i1',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
            index: 2,
          }),
          MIR_INDEX_ACCESS({
            name: 'i3',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('i1', MIR_INT_TYPE),
            index: 1,
          }),
        ],
        s2: [
          MIR_INDEX_ACCESS({
            name: 'i2',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
            index: 2,
          }),
          MIR_INDEX_ACCESS({
            name: 'i4',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('i2', MIR_INT_TYPE),
            index: 1,
          }),
        ],
        finalAssignments: [],
      }),
      MIR_INDEX_ACCESS({
        name: 'i5',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('i0', MIR_INT_TYPE),
        index: 1,
      }),
    ],
    MIR_ZERO,
    `let i0: int = (a: int)[2];
if 0 {
  let i3: int = (i0: int)[1];
} else {
  let i4: int = (i0: int)[1];
}
let i5: int = (i0: int)[1];
return 0;`
  );
});

it('optimizeMidIRStatementsByLocalValueNumbering works on if-else 2/n', () => {
  assertCorrectlyOptimized(
    [
      MIR_INDEX_ACCESS({
        name: 'i0',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
        index: 2,
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_ZERO,
        s1: [
          MIR_INDEX_ACCESS({
            name: 'i1',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
            index: 2,
          }),
          MIR_INDEX_ACCESS({
            name: 'i3',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('i1', MIR_INT_TYPE),
            index: 1,
          }),
        ],
        s2: [
          MIR_INDEX_ACCESS({
            name: 'i2',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('a', MIR_INT_TYPE),
            index: 2,
          }),
          MIR_INDEX_ACCESS({
            name: 'i4',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_VARIABLE('i2', MIR_INT_TYPE),
            index: 1,
          }),
        ],
        finalAssignments: [
          {
            name: 'bar',
            type: MIR_INT_TYPE,
            branch1Value: MIR_VARIABLE('i1', MIR_INT_TYPE),
            branch2Value: MIR_VARIABLE('i2', MIR_INT_TYPE),
          },
        ],
      }),
    ],
    MIR_ZERO,
    `let i0: int = (a: int)[2];
let bar: int;
if 0 {
  let i3: int = (i0: int)[1];
  bar = (i0: int);
} else {
  let i4: int = (i0: int)[1];
  bar = (i0: int);
}
return 0;`
  );
});

it('optimizeMidIRStatementsByLocalValueNumbering works on while statement 1/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: MIR_INT_TYPE,
            initialValue: MIR_INT(10),
            loopValue: MIR_VARIABLE('_tmp_n', MIR_INT_TYPE),
          },
        ],
        statements: [
          MIR_BINARY({
            name: 'is_zero',
            operator: '==',
            e1: MIR_VARIABLE('n', MIR_INT_TYPE),
            e2: MIR_ZERO,
          }),
          MIR_IF_ELSE({
            booleanExpression: MIR_VARIABLE('is_zero', MIR_BOOL_TYPE),
            s1: [],
            s2: [
              MIR_BINARY({
                name: 's2_n',
                operator: '-',
                e1: MIR_VARIABLE('n', MIR_INT_TYPE),
                e2: MIR_ONE,
              }),
            ],
            finalAssignments: [
              { name: 'c', type: MIR_INT_TYPE, branch1Value: MIR_FALSE, branch2Value: MIR_TRUE },
              {
                name: '_tmp_n',
                type: MIR_INT_TYPE,
                branch1Value: MIR_VARIABLE('n', MIR_INT_TYPE),
                branch2Value: MIR_VARIABLE('s2_n', MIR_INT_TYPE),
              },
            ],
          }),
        ],
      }),
    ],
    MIR_ZERO,
    `let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: bool) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return 0;`
  );
});

it('optimizeMidIRStatementsByLocalValueNumbering works on while statement 2/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: MIR_INT_TYPE,
            initialValue: MIR_INT(10),
            loopValue: MIR_VARIABLE('_tmp_n', MIR_INT_TYPE),
          },
        ],
        statements: [
          MIR_BINARY({
            name: 'is_zero',
            operator: '==',
            e1: MIR_VARIABLE('n', MIR_INT_TYPE),
            e2: MIR_ZERO,
          }),
          MIR_IF_ELSE({
            booleanExpression: MIR_VARIABLE('is_zero', MIR_BOOL_TYPE),
            s1: [],
            s2: [
              MIR_BINARY({
                name: 's2_n',
                operator: '-',
                e1: MIR_VARIABLE('n', MIR_INT_TYPE),
                e2: MIR_ONE,
              }),
            ],
            finalAssignments: [
              { name: 'c', type: MIR_INT_TYPE, branch1Value: MIR_FALSE, branch2Value: MIR_TRUE },
              {
                name: '_tmp_n',
                type: MIR_INT_TYPE,
                branch1Value: MIR_VARIABLE('n', MIR_INT_TYPE),
                branch2Value: MIR_VARIABLE('s2_n', MIR_INT_TYPE),
              },
            ],
          }),
        ],
        breakCollector: { name: 'v', type: MIR_INT_TYPE },
      }),
    ],
    MIR_VARIABLE('v', MIR_INT_TYPE),
    `let n: int = 10;
let v: int;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: bool) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return (v: int);`
  );
});
