import optimizeMidIRFunctionByConditionalConstantPropagation from '../mir-conditional-constant-propagation-optimization';

import {
  MidIRExpression,
  MidIRStatement,
  debugPrintMidIRExpression,
  debugPrintMidIRStatement,
  MIR_TRUE,
  MIR_FALSE,
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
} from 'samlang-core-ast/mir-expressions';
import { MIR_BOOL_TYPE, MIR_INT_TYPE } from 'samlang-core-ast/mir-types';

const assertCorrectlyOptimized = (
  statements: MidIRStatement[],
  returnValue: MidIRExpression,
  expected: string
): void => {
  const { body, returnValue: optimizedReturnValue } =
    optimizeMidIRFunctionByConditionalConstantPropagation({
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

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of simple statements.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a0',
        operator: '+',
        e1: MIR_INT(3),
        e2: MIR_INT(3),
      }),
      MIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a0', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '-',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a0', MIR_INT_TYPE),
      }),
      MIR_INDEX_ACCESS({
        name: 'i0',
        type: MIR_INT_TYPE,
        pointerExpression: MIR_VARIABLE('a0', MIR_INT_TYPE),
        index: 2,
      }),
      MIR_BINARY({
        name: 'a3',
        operator: '*',
        e1: MIR_VARIABLE('a2', MIR_INT_TYPE),
        e2: MIR_ONE,
      }),
      MIR_BINARY({
        name: 'b1',
        operator: '/',
        e1: MIR_VARIABLE('a2', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a2', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b2',
        operator: '-',
        e1: MIR_VARIABLE('a2', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a2', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b3',
        operator: '*',
        e1: MIR_VARIABLE('b1', MIR_INT_TYPE),
        e2: MIR_VARIABLE('b2', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b4',
        operator: '%',
        e1: MIR_VARIABLE('b1', MIR_INT_TYPE),
        e2: MIR_VARIABLE('b1', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b5',
        operator: '-',
        e1: MIR_VARIABLE('i0', MIR_INT_TYPE),
        e2: MIR_VARIABLE('i0', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b6',
        operator: '%',
        e1: MIR_VARIABLE('i0', MIR_INT_TYPE),
        e2: MIR_VARIABLE('i0', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b7',
        operator: '/',
        e1: MIR_VARIABLE('i0', MIR_INT_TYPE),
        e2: MIR_VARIABLE('i0', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'b8',
        operator: '*',
        e1: MIR_VARIABLE('i0', MIR_INT_TYPE),
        e2: MIR_VARIABLE('i0', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'a4',
        operator: '+',
        e1: MIR_VARIABLE('a3', MIR_INT_TYPE),
        e2: MIR_ZERO,
      }),
      MIR_BINARY({
        name: 'a5',
        operator: '/',
        e1: MIR_VARIABLE('a4', MIR_INT_TYPE),
        e2: MIR_VARIABLE('b1', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'a6',
        operator: '/',
        e1: MIR_VARIABLE('i1', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a5', MIR_INT_TYPE),
      }),
      MIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: MIR_INT_TYPE,
        expressionList: [
          MIR_VARIABLE('b2', MIR_INT_TYPE),
          MIR_VARIABLE('a6', MIR_INT_TYPE),
          MIR_VARIABLE('a5', MIR_INT_TYPE),
        ],
      }),
      MIR_FUNCTION_CALL({
        functionExpression: MIR_NAME('fff', MIR_INT_TYPE),
        functionArguments: [
          MIR_VARIABLE('b1', MIR_INT_TYPE),
          MIR_VARIABLE('b2', MIR_INT_TYPE),
          MIR_VARIABLE('b3', MIR_INT_TYPE),
          MIR_VARIABLE('b4', MIR_INT_TYPE),
          MIR_VARIABLE('b5', MIR_INT_TYPE),
          MIR_VARIABLE('b6', MIR_INT_TYPE),
          MIR_VARIABLE('b7', MIR_INT_TYPE),
        ],
        returnType: MIR_INT_TYPE,
      }),
      MIR_BINARY({
        name: 'a7',
        operator: '%',
        e1: MIR_VARIABLE('a5', MIR_INT_TYPE),
        e2: MIR_INT(12),
      }),
      MIR_BINARY({
        name: 'a8',
        operator: '*',
        e1: MIR_VARIABLE('a7', MIR_INT_TYPE),
        e2: MIR_INT(7),
      }),
      MIR_BINARY({
        name: 'a9',
        operator: '/',
        e1: MIR_VARIABLE('a7', MIR_INT_TYPE),
        e2: MIR_ZERO,
      }),
      MIR_BINARY({
        name: 'a10',
        operator: '%',
        e1: MIR_VARIABLE('a7', MIR_INT_TYPE),
        e2: MIR_ZERO,
      }),
      MIR_BINARY({
        name: 'a11',
        operator: '/',
        e1: MIR_INT(-11),
        e2: MIR_INT(10),
      }),
      MIR_BINARY({
        name: 'a12',
        operator: '/',
        e1: MIR_INT(11),
        e2: MIR_INT(10),
      }),
      MIR_CAST({
        name: 'ss',
        type: MIR_INT_TYPE,
        assignedExpression: MIR_VARIABLE('a3', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'a13',
        operator: '+',
        e1: MIR_VARIABLE('a11', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a8', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'a14',
        operator: '+',
        e1: MIR_VARIABLE('a13', MIR_INT_TYPE),
        e2: MIR_VARIABLE('a12', MIR_INT_TYPE),
      }),
    ],
    MIR_VARIABLE('a14', MIR_INT_TYPE),
    `let i0: int = 6[2];
let b8: int = (i0: int) * (i0: int);
let a6: int = (i1: int) / 30;
let s: int = [0, (a6: int), 30];
fff(1, 0, 0, 0, 0, 0, 1);
let a9: int = 6 / 0;
let a10: int = 6 % 0;
let ss: int = 30;
return 42;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 1/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '+',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: int = (a0: int) + 4;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 2/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '-',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: int = (a0: int) + -1;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 3/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '-',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '+',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + -2;\nlet a2: int = (a0: int) + 1;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 4/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '-',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '-',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + -2;\nlet a2: int = (a0: int) + -5;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 5/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '*',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) * 2;\nlet a2: int = (a0: int) * 6;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 6/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '<',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: bool = (a0: int) < 1;\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '<=',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: bool = (a0: int) <= 1;\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '>',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: bool = (a0: int) > 1;\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '>=',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: bool = (a0: int) >= 1;\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '==',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: bool = (a0: int) == 1;\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '+',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '!=',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) + 2;\nlet a2: bool = (a0: int) != 1;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on a series of binary statements 6/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: MIR_VARIABLE('a0', MIR_INT_TYPE),
        e2: MIR_INT(2),
      }),
      MIR_BINARY({
        name: 'a2',
        operator: '==',
        e1: MIR_VARIABLE('a1', MIR_INT_TYPE),
        e2: MIR_INT(3),
      }),
    ],
    MIR_ZERO,
    `let a1: int = (a0: int) * 2;\nlet a2: bool = (a1: int) == 3;\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on if-else statement 1/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({ name: 'b1', operator: '<', e1: MIR_ZERO, e2: MIR_ONE }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b1', MIR_BOOL_TYPE),
        s1: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        s2: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        finalAssignments: [],
      }),
      MIR_BINARY({ name: 'b2', operator: '>', e1: MIR_ZERO, e2: MIR_ONE }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b2', MIR_BOOL_TYPE),
        s1: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        s2: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        finalAssignments: [],
      }),
      MIR_BINARY({ name: 'b3', operator: '<=', e1: MIR_ZERO, e2: MIR_ONE }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b3', MIR_BOOL_TYPE),
        s1: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'a1',
          }),
        ],
        s2: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'a2',
          }),
        ],
        finalAssignments: [
          {
            name: 'ma1',
            type: MIR_INT_TYPE,
            branch1Value: MIR_VARIABLE('a1', MIR_INT_TYPE),
            branch2Value: MIR_VARIABLE('a2', MIR_INT_TYPE),
          },
        ],
      }),
      MIR_BINARY({ name: 'b4', operator: '>=', e1: MIR_ZERO, e2: MIR_ONE }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b4', MIR_BOOL_TYPE),
        s1: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'a11',
          }),
        ],
        s2: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bar', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
            returnCollector: 'a22',
          }),
        ],
        finalAssignments: [
          {
            name: 'ma2',
            type: MIR_INT_TYPE,
            branch1Value: MIR_VARIABLE('a11', MIR_INT_TYPE),
            branch2Value: MIR_VARIABLE('a22', MIR_INT_TYPE),
          },
        ],
      }),
      MIR_BINARY({
        name: 'r1',
        operator: '==',
        e1: MIR_VARIABLE('ma1', MIR_INT_TYPE),
        e2: MIR_VARIABLE('ma2', MIR_INT_TYPE),
      }),
      MIR_BINARY({
        name: 'r2',
        operator: '!=',
        e1: MIR_ONE,
        e2: MIR_ZERO,
      }),
      MIR_BINARY({
        name: 'r3',
        operator: '^',
        e1: MIR_TRUE,
        e2: MIR_FALSE,
      }),
      MIR_BINARY({
        name: 'r4',
        operator: '!=',
        e1: MIR_ONE,
        e2: MIR_ZERO,
      }),
      MIR_BINARY({
        name: 'r5',
        operator: '==',
        e1: MIR_VARIABLE('r4', MIR_BOOL_TYPE),
        e2: MIR_VARIABLE('r2', MIR_BOOL_TYPE),
      }),
    ],
    MIR_VARIABLE('r5', MIR_BOOL_TYPE),
    `foo();
bar();
let a1: int = foo();
let a22: int = bar();
let r1: bool = (a22: int) == (a1: int);
return 1;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on if-else statement 2/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_BINARY({
        name: 'a0',
        operator: '+',
        e1: MIR_INT(3),
        e2: MIR_INT(3),
      }),
      MIR_BINARY({
        name: 'a1',
        operator: '*',
        e1: MIR_INT(3),
        e2: MIR_INT(3),
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
        s1: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [MIR_VARIABLE('a0', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
        ],
        s2: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bar', MIR_INT_TYPE),
            functionArguments: [MIR_VARIABLE('a1', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
        ],
        finalAssignments: [],
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
        s1: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [MIR_VARIABLE('a0', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
            returnCollector: 'a1',
          }),
        ],
        s2: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('bar', MIR_INT_TYPE),
            functionArguments: [MIR_VARIABLE('a1', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
            returnCollector: 'a2',
          }),
        ],
        finalAssignments: [
          {
            name: 'ma1',
            type: MIR_INT_TYPE,
            branch1Value: MIR_VARIABLE('a1', MIR_INT_TYPE),
            branch2Value: MIR_VARIABLE('a2', MIR_INT_TYPE),
          },
        ],
      }),
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
        s1: [],
        s2: [],
        finalAssignments: [
          {
            name: 'ma2',
            type: MIR_INT_TYPE,
            branch1Value: MIR_VARIABLE('a0', MIR_INT_TYPE),
            branch2Value: MIR_VARIABLE('a0', MIR_INT_TYPE),
          },
        ],
      }),
    ],
    MIR_VARIABLE('ma2', MIR_INT_TYPE),
    `if (b: bool) {
  foo(6);
} else {
  bar(9);
}
let ma1: int;
if (b: bool) {
  let a1: int = foo(6);
  ma1 = 9;
} else {
  let a2: int = bar(9);
  ma1 = (a2: int);
}
return 6;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on single if statement.', () => {
  assertCorrectlyOptimized(
    [
      MIR_SINGLE_IF({
        booleanExpression: MIR_ZERO,
        invertCondition: false,
        statements: [MIR_BREAK(MIR_VARIABLE('n', MIR_INT_TYPE))],
      }),
    ],
    MIR_ZERO,
    `\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_SINGLE_IF({
        booleanExpression: MIR_ZERO,
        invertCondition: true,
        statements: [MIR_BREAK(MIR_VARIABLE('n', MIR_INT_TYPE))],
      }),
    ],
    MIR_ZERO,
    `undefined = (n: int);\nbreak;\nreturn 0;`
  );

  assertCorrectlyOptimized(
    [
      MIR_SINGLE_IF({
        booleanExpression: MIR_VARIABLE('n', MIR_INT_TYPE),
        invertCondition: false,
        statements: [],
      }),
    ],
    MIR_ZERO,
    `\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on while statement 1/n.', () => {
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
          MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('is_zero', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: [MIR_BREAK(MIR_VARIABLE('n', MIR_INT_TYPE))],
          }),
          MIR_BINARY({
            name: '_tmp_n',
            operator: '-',
            e1: MIR_VARIABLE('n', MIR_INT_TYPE),
            e2: MIR_ONE,
          }),
        ],
      }),
    ],
    MIR_ZERO,
    `let n: int = 4;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = (n: int);
    break;
  }
  let _tmp_n: int = (n: int) + -1;
  n = (_tmp_n: int);
}
return 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on while statement 2/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: MIR_INT_TYPE,
            initialValue: MIR_INT(10),
            loopValue: MIR_INT(10),
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
            invertCondition: true,
            statements: [MIR_BREAK(MIR_VARIABLE('n', MIR_INT_TYPE))],
          }),
          MIR_BINARY({
            name: 'is_zero',
            operator: '==',
            e1: MIR_VARIABLE('n', MIR_INT_TYPE),
            e2: MIR_ZERO,
          }),
        ],
      }),
    ],
    MIR_ZERO,
    `\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on while statement 3/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: MIR_INT_TYPE,
            initialValue: MIR_INT(10),
            loopValue: MIR_VARIABLE('t', MIR_INT_TYPE),
          },
        ],
        statements: [MIR_BREAK(MIR_VARIABLE('n', MIR_INT_TYPE))],
      }),
    ],
    MIR_ZERO,
    `\nreturn 0;`
  );
});

it('optimizeMidIRStatementsByConditionalConstantPropagation works on while statement 4/n.', () => {
  assertCorrectlyOptimized(
    [
      MIR_WHILE({
        loopVariables: [
          {
            name: 'n',
            type: MIR_INT_TYPE,
            initialValue: MIR_INT(10),
            loopValue: MIR_VARIABLE('t', MIR_INT_TYPE),
          },
        ],
        statements: [MIR_BREAK(MIR_VARIABLE('n', MIR_INT_TYPE))],
        breakCollector: { name: 'v', type: MIR_INT_TYPE },
      }),
    ],
    MIR_VARIABLE('v', MIR_INT_TYPE),
    `\nreturn 10;`
  );
});
