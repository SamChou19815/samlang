import {
  debugPrintHighIRExpression,
  debugPrintHighIRStatement,
  HighIRExpression,
  HighIRStatement,
  HIR_BINARY,
  HIR_BOOL_TYPE,
  HIR_BREAK,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_NAME,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_INT_TYPE,
  HIR_ONE,
  HIR_SINGLE_IF,
  HIR_STRUCT_INITIALIZATION,
  HIR_VARIABLE,
  HIR_WHILE,
  HIR_ZERO,
} from '../../ast/hir-nodes';
import optimizeHighIRFunctionByDeadCodeElimination from '../hir-dead-code-elimination-optimization';

function assertCorrectlyOptimized(
  statements: HighIRStatement[],
  returnValue: HighIRExpression,
  expected: string,
): void {
  const { body, returnValue: optimizedReturnValue } = optimizeHighIRFunctionByDeadCodeElimination({
    name: '',
    typeParameters: [],
    parameters: [],
    type: { __type__: 'FunctionType', argumentTypes: [], returnType: HIR_INT_TYPE },
    body: statements,
    returnValue,
  });

  expect(
    `${body.map((it) => debugPrintHighIRStatement(it)).join('\n')}\n` +
      `return ${debugPrintHighIRExpression(optimizedReturnValue)};`,
  ).toBe(expected);
}

describe('hir-dead-code-elimination', () => {
  it('optimizeHighIRStatementsByDeadCodeElimination works on a series of simple statements 1/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'u1', operator: '/', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_BINARY({ name: 'u2', operator: '%', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_BINARY({ name: 'u3', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_BINARY({ name: 'p', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_INDEX_ACCESS({
          name: 'i',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('p', HIR_INT_TYPE),
          index: 3,
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('S'),
          expressionList: [HIR_VARIABLE('p', HIR_INT_TYPE)],
        }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_FUNCTION_NAME('ff', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
          functionArguments: [HIR_VARIABLE('s', HIR_INT_TYPE)],
          returnType: HIR_INT_TYPE,
        }),
      ],
      HIR_VARIABLE('ii', HIR_INT_TYPE),
      `let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let s: S = [(p: int)];
ff((s: int));
return (ii: int);`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on a series of simple statements 2/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'u1', operator: '/', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_BINARY({ name: 'u2', operator: '%', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_BINARY({ name: 'u3', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_BINARY({ name: 'p', operator: '+', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_INDEX_ACCESS({
          name: 'i',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('p', HIR_INT_TYPE),
          index: 3,
        }),
        HIR_INDEX_ACCESS({
          name: 'i1',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('p', HIR_INT_TYPE),
          index: 3,
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('S'),
          expressionList: [HIR_VARIABLE('p', HIR_INT_TYPE)],
        }),
        HIR_CLOSURE_INITIALIZATION({
          closureVariableName: 's',
          closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Id'),
          functionName: 'closure',
          functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          context: HIR_VARIABLE('b2', HIR_INT_TYPE),
        }),
        HIR_CLOSURE_INITIALIZATION({
          closureVariableName: 's1',
          closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Id'),
          functionName: 'closure',
          functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          context: HIR_VARIABLE('b2', HIR_INT_TYPE),
        }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_FUNCTION_NAME('ff', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
          functionArguments: [
            HIR_VARIABLE('i1', HIR_INT_TYPE),
            HIR_VARIABLE('s1', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Id')),
          ],
          returnType: HIR_INT_TYPE,
        }),
      ],
      HIR_ZERO,
      `let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let i1: int = (p: int)[3];
let s1: Id = Closure { fun: (closure: () -> int), context: (b2: int) };
ff((i1: int), (s1: Id));
return 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 1/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          finalAssignments: [],
        }),
      ],
      HIR_ZERO,
      `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 2/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'a1',
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'a2',
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: HIR_INT_TYPE,
              branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
              branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
            },
          ],
        }),
      ],
      HIR_VARIABLE('ma', HIR_INT_TYPE),
      `let b: bool = 0 == 1;
let ma: int;
if (b: bool) {
  let a1: int = s1();
  ma = (a1: int);
} else {
  let a2: int = s1();
  ma = (a2: int);
}
return (ma: int);`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 3/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: HIR_INT_TYPE,
              branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
              branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
            },
          ],
        }),
      ],
      HIR_ZERO,
      `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 4/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'a1',
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
              returnCollector: 'a2',
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: HIR_INT_TYPE,
              branch1Value: HIR_VARIABLE('a1', HIR_INT_TYPE),
              branch2Value: HIR_VARIABLE('a2', HIR_INT_TYPE),
            },
          ],
        }),
      ],
      HIR_ZERO,
      `let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on if-else statements 5/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_BINARY({ name: 'b', operator: '==', e1: HIR_ZERO, e2: HIR_ONE }),
        HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
          s1: [],
          s2: [],
          finalAssignments: [],
        }),
      ],
      HIR_ZERO,
      `\nreturn 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on single if.', () => {
    assertCorrectlyOptimized(
      [
        HIR_SINGLE_IF({
          booleanExpression: HIR_VARIABLE('is_zero', HIR_BOOL_TYPE),
          invertCondition: false,
          statements: [],
        }),
      ],
      HIR_ZERO,
      `\nreturn 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 1/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_WHILE({
          loopVariables: [
            {
              name: 'n',
              type: HIR_INT_TYPE,
              initialValue: HIR_INT(10),
              loopValue: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
            },
            {
              name: 'unused',
              type: HIR_INT_TYPE,
              initialValue: HIR_INT(10),
              loopValue: HIR_INT(20),
            },
          ],
          statements: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME('s1', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [HIR_ZERO],
              returnType: HIR_INT_TYPE,
              returnCollector: 'a2',
            }),
            HIR_BINARY({
              name: 'is_zero',
              operator: '==',
              e1: HIR_VARIABLE('n', HIR_INT_TYPE),
              e2: HIR_ZERO,
            }),
            HIR_IF_ELSE({
              booleanExpression: HIR_VARIABLE('is_zero', HIR_BOOL_TYPE),
              s1: [
                HIR_INDEX_ACCESS({
                  name: '',
                  type: HIR_INT_TYPE,
                  pointerExpression: HIR_ZERO,
                  index: 0,
                }),
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: 's',
                  type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('S'),
                  expressionList: [HIR_VARIABLE('p', HIR_INT_TYPE)],
                }),
                HIR_CLOSURE_INITIALIZATION({
                  closureVariableName: 's',
                  closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Id'),
                  functionName: 'closure',
                  functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
                  context: HIR_VARIABLE('b2', HIR_INT_TYPE),
                }),
              ],
              s2: [
                HIR_BINARY({
                  name: 's2_n',
                  operator: '-',
                  e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                  e2: HIR_ONE,
                }),
              ],
              finalAssignments: [
                {
                  name: '_tmp_n',
                  type: HIR_INT_TYPE,
                  branch1Value: HIR_VARIABLE('n', HIR_INT_TYPE),
                  branch2Value: HIR_VARIABLE('s2_n', HIR_INT_TYPE),
                },
              ],
            }),
          ],
        }),
      ],
      HIR_ZERO,
      `let n: int = 10;
while (true) {
  s1(0);
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
return 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 2/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_WHILE({
          loopVariables: [
            {
              name: 'n',
              type: HIR_INT_TYPE,
              initialValue: HIR_INT(10),
              loopValue: HIR_VARIABLE('_tmp_n', HIR_INT_TYPE),
            },
            {
              name: 'n1',
              type: HIR_INT_TYPE,
              initialValue: HIR_INT(10),
              loopValue: HIR_INT(20),
            },
          ],
          statements: [
            HIR_BINARY({
              name: 'is_zero',
              operator: '==',
              e1: HIR_VARIABLE('n', HIR_INT_TYPE),
              e2: HIR_ZERO,
            }),

            HIR_SINGLE_IF({
              booleanExpression: HIR_VARIABLE('is_zero', HIR_BOOL_TYPE),
              invertCondition: false,
              statements: [HIR_BREAK(HIR_ZERO)],
            }),
          ],
          breakCollector: { name: 'v', type: HIR_INT_TYPE },
        }),
      ],
      HIR_ZERO,
      `let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = 0;
    break;
  }
  n = (_tmp_n: int);
}
return 0;`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 3/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_WHILE({
          loopVariables: [
            {
              name: 'n',
              type: HIR_INT_TYPE,
              initialValue: HIR_INT(10),
              loopValue: HIR_VARIABLE('n1', HIR_INT_TYPE),
            },
          ],
          statements: [
            HIR_BINARY({
              name: 'n1',
              operator: '+',
              e1: HIR_VARIABLE('n', HIR_INT_TYPE),
              e2: HIR_ZERO,
            }),
          ],
          breakCollector: { name: 'v', type: HIR_INT_TYPE },
        }),
      ],
      HIR_VARIABLE('v', HIR_INT_TYPE),
      `let n: int = 10;
let v: int;
while (true) {
  let n1: int = (n: int) + 0;
  n = (n1: int);
}
return (v: int);`,
    );
  });

  it('optimizeHighIRStatementsByDeadCodeElimination works on while statement 4/n.', () => {
    assertCorrectlyOptimized(
      [
        HIR_WHILE({
          loopVariables: [
            {
              name: 'n',
              type: HIR_INT_TYPE,
              initialValue: HIR_INT(10),
              loopValue: HIR_INT(11),
            },
          ],
          statements: [
            HIR_BINARY({
              name: 'n1',
              operator: '+',
              e1: HIR_VARIABLE('n', HIR_INT_TYPE),
              e2: HIR_ZERO,
            }),
          ],
        }),
      ],
      HIR_VARIABLE('v', HIR_INT_TYPE),
      `while (true) {
}
return (v: int);`,
    );
  });
});
