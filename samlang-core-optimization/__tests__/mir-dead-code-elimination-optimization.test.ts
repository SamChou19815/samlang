import {
  MidIRExpression,
  MidIRStatement,
  debugPrintMidIRExpression,
  debugPrintMidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_INDEX_ACCESS,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import optimizeMidIRFunctionByDeadCodeElimination from '../mir-dead-code-elimination-optimization';

const assertCorrectlyOptimized = (
  statements: MidIRStatement[],
  returnValue: MidIRExpression,
  expected: string
): void => {
  const { body, returnValue: optimizedReturnValue } = optimizeMidIRFunctionByDeadCodeElimination({
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

describe('mir-dead-code-elimination', () => {
  it('optimizeMidIRStatementsByDeadCodeElimination works on a series of simple statements 1/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'u1', operator: '/', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_BINARY({ name: 'u2', operator: '%', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_BINARY({ name: 'u3', operator: '+', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_BINARY({ name: 'p', operator: '+', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_INDEX_ACCESS({
          name: 'i',
          type: MIR_INT_TYPE,
          pointerExpression: MIR_VARIABLE('p', MIR_INT_TYPE),
          index: 3,
        }),
        MIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: MIR_INT_TYPE,
          expressionList: [MIR_VARIABLE('p', MIR_INT_TYPE)],
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('ff', MIR_INT_TYPE),
          functionArguments: [MIR_VARIABLE('s', MIR_INT_TYPE)],
          returnType: MIR_INT_TYPE,
        }),
        MIR_CAST({
          name: 'ii',
          type: MIR_INT_TYPE,
          assignedExpression: MIR_VARIABLE('i', MIR_INT_TYPE),
        }),
      ],
      MIR_VARIABLE('ii', MIR_INT_TYPE),
      `let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let i: int = (p: int)[3];
let s: int = [(p: int)];
ff((s: int));
let ii: int = (i: int);
return (ii: int);`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on a series of simple statements 2/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'u1', operator: '/', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_BINARY({ name: 'u2', operator: '%', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_BINARY({ name: 'u3', operator: '+', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_BINARY({ name: 'p', operator: '+', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_INDEX_ACCESS({
          name: 'i',
          type: MIR_INT_TYPE,
          pointerExpression: MIR_VARIABLE('p', MIR_INT_TYPE),
          index: 3,
        }),
        MIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: MIR_INT_TYPE,
          expressionList: [MIR_VARIABLE('p', MIR_INT_TYPE)],
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('ff', MIR_INT_TYPE),
          functionArguments: [],
          returnType: MIR_INT_TYPE,
        }),
      ],
      MIR_ZERO,
      `let u1: int = 0 / 1;
let u2: int = 0 % 1;
ff();
return 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on if-else statements 1/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'b', operator: '==', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
            }),
          ],
          finalAssignments: [],
        }),
      ],
      MIR_ZERO,
      `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on if-else statements 2/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'b', operator: '==', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
              returnCollector: 'a1',
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
              returnCollector: 'a2',
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('a1', MIR_INT_TYPE),
              branch2Value: MIR_VARIABLE('a2', MIR_INT_TYPE),
            },
          ],
        }),
      ],
      MIR_VARIABLE('ma', MIR_INT_TYPE),
      `let b: bool = 0 == 1;
let ma: int;
if (b: bool) {
  let a1: int = s1();
  ma = (a1: int);
} else {
  let a2: int = s1();
  ma = (a2: int);
}
return (ma: int);`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on if-else statements 3/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'b', operator: '==', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('a1', MIR_INT_TYPE),
              branch2Value: MIR_VARIABLE('a2', MIR_INT_TYPE),
            },
          ],
        }),
      ],
      MIR_ZERO,
      `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on if-else statements 4/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'b', operator: '==', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
              returnCollector: 'a1',
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('s1', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
              returnCollector: 'a2',
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: MIR_INT_TYPE,
              branch1Value: MIR_VARIABLE('a1', MIR_INT_TYPE),
              branch2Value: MIR_VARIABLE('a2', MIR_INT_TYPE),
            },
          ],
        }),
      ],
      MIR_ZERO,
      `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on if-else statements 5/n.', () => {
    assertCorrectlyOptimized(
      [
        MIR_BINARY({ name: 'b', operator: '==', e1: MIR_ZERO, e2: MIR_ONE }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
          s1: [],
          s2: [],
          finalAssignments: [],
        }),
      ],
      MIR_ZERO,
      `\nreturn 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on single if.', () => {
    assertCorrectlyOptimized(
      [
        MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('is_zero', MIR_BOOL_TYPE),
          invertCondition: false,
          statements: [],
        }),
      ],
      MIR_ZERO,
      `\nreturn 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on while statement 1/n.', () => {
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
            {
              name: 'unused',
              type: MIR_INT_TYPE,
              initialValue: MIR_INT(10),
              loopValue: MIR_INT(20),
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
              s1: [
                MIR_INDEX_ACCESS({
                  name: '',
                  type: MIR_INT_TYPE,
                  pointerExpression: MIR_ZERO,
                  index: 0,
                }),
                MIR_CAST({
                  name: '_',
                  type: MIR_INT_TYPE,
                  assignedExpression: MIR_VARIABLE('unused', MIR_INT_TYPE),
                }),
                MIR_STRUCT_INITIALIZATION({
                  structVariableName: 's',
                  type: MIR_INT_TYPE,
                  expressionList: [MIR_VARIABLE('p', MIR_INT_TYPE)],
                }),
                MIR_CAST({
                  name: 'ii',
                  type: MIR_INT_TYPE,
                  assignedExpression: MIR_VARIABLE('i', MIR_INT_TYPE),
                }),
              ],
              s2: [
                MIR_BINARY({
                  name: 's2_n',
                  operator: '-',
                  e1: MIR_VARIABLE('n', MIR_INT_TYPE),
                  e2: MIR_ONE,
                }),
              ],
              finalAssignments: [
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
  let _tmp_n: int;
  if (is_zero: bool) {
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return 0;`
    );
  });

  it('optimizeMidIRStatementsByDeadCodeElimination works on while statement 2/n.', () => {
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
            {
              name: 'n1',
              type: MIR_INT_TYPE,
              initialValue: MIR_INT(10),
              loopValue: MIR_INT(20),
            },
          ],
          statements: [
            MIR_BINARY({
              name: 'is_zero',
              operator: '==',
              e1: MIR_VARIABLE('n', MIR_INT_TYPE),
              e2: MIR_ZERO,
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_VARIABLE('is_zero', MIR_BOOL_TYPE),
              invertCondition: false,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
          ],
          breakCollector: { name: 'v', type: MIR_INT_TYPE },
        }),
      ],
      MIR_ZERO,
      `let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = 0;
    break;
  }
  n = (_tmp_n: int);
}
return 0;`
    );
  });
});
