import coalesceMoveAndReturnForHighIRStatements from '../hir-move-return-coalescing';

import {
  HighIRStatement,
  debugPrintHighIRStatement,
  HIR_ZERO,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
  HIR_LET,
  HIR_NAME,
  HIR_RETURN,
  HIR_STRUCT_INITIALIZATION,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE, HIR_STRUCT_TYPE, HIR_FUNCTION_TYPE } from 'samlang-core-ast/hir-types';

const assertCoalesceMoveAndReturnWithForHighIRStatements = (
  statements: readonly HighIRStatement[],
  expected: string | null
) => {
  const result = coalesceMoveAndReturnForHighIRStatements(statements);
  if (expected == null) {
    expect(result).toBeNull();
  } else expect(result?.map((it) => debugPrintHighIRStatement(it)).join('\n')).toBe(expected);
};

it('coalesceMoveAndReturnWithForHighIRStatements empty array test', () => {
  assertCoalesceMoveAndReturnWithForHighIRStatements([], null);
});

it('coalesceMoveAndReturnWithForHighIRStatements not end with return test', () => {
  assertCoalesceMoveAndReturnWithForHighIRStatements([HIR_WHILE_TRUE([], [])], null);
});

it('coalesceMoveAndReturnWithForHighIRStatements not end with return variable test', () => {
  assertCoalesceMoveAndReturnWithForHighIRStatements([HIR_RETURN(HIR_ZERO)], null);
});

it('coalesceMoveAndReturnWithForHighIRStatements linear sequence test', () => {
  assertCoalesceMoveAndReturnWithForHighIRStatements(
    [
      HIR_WHILE_TRUE([], []),
      HIR_LET({ name: 'one_const_value', type: HIR_INT_TYPE, assignedExpression: HIR_ONE }),
      HIR_LET({
        name: 'one2',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one_const_value', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: 'one1',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one2', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: 'one',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one1', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: '_t1',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one', HIR_INT_TYPE),
      }),
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'useless',
        type: HIR_STRUCT_TYPE([]),
        expressionList: [],
      }),
      HIR_RETURN(HIR_VARIABLE('_t1', HIR_INT_TYPE)),
    ],
    '// phi()\nwhile true {\n}\nreturn 1;'
  );
});

it('coalesceMoveAndReturnWithForHighIRStatements failed linear sequence test', () => {
  assertCoalesceMoveAndReturnWithForHighIRStatements(
    [
      HIR_WHILE_TRUE([], []),
      HIR_LET({ name: 'one_const_value', type: HIR_INT_TYPE, assignedExpression: HIR_ONE }),
      HIR_LET({
        name: 'one2',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one_const_value', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: 'one1',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one2', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: 'one',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one1', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: '_t1',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('one', HIR_INT_TYPE),
      }),
      HIR_LET({
        name: 'garbage',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_VARIABLE('garbage', HIR_INT_TYPE),
      }),
      HIR_RETURN(HIR_VARIABLE('_t1', HIR_INT_TYPE)),
    ],
    null
  );
});

it('coalesceMoveAndReturnWithForHighIRStatements if-else test', () => {
  assertCoalesceMoveAndReturnWithForHighIRStatements(
    [
      HIR_IF_ELSE({
        multiAssignedVariable: '_t1',
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_VARIABLE('n', HIR_INT_TYPE),
          e2: HIR_ZERO,
        }),
        s1: [
          HIR_LET({ name: 'one_const_value', type: HIR_INT_TYPE, assignedExpression: HIR_ONE }),
          HIR_LET({
            name: 'one2',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('one_const_value', HIR_INT_TYPE),
          }),
          HIR_LET({
            name: 'one1',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('one2', HIR_INT_TYPE),
          }),
          HIR_LET({
            name: 'one',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('one1', HIR_INT_TYPE),
          }),
          HIR_LET({
            name: '_t1',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('one', HIR_INT_TYPE),
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              '_module__class_Class1_function_factorial',
              HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE)
            ),
            functionArguments: [
              HIR_BINARY({
                operator: '-',
                e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                e2: HIR_ONE,
              }),
              HIR_BINARY({
                operator: '*',
                e1: HIR_VARIABLE('n', HIR_INT_TYPE),
                e2: HIR_VARIABLE('acc', HIR_INT_TYPE),
              }),
            ],
            returnCollector: { name: '_t0', type: HIR_INT_TYPE },
          }),
          HIR_LET({
            name: '_t1',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
          }),
        ],
      }),
      HIR_RETURN(HIR_VARIABLE('_t1', HIR_INT_TYPE)),
    ],
    `if ((n: int) == 0) {
  return 1;
} else {
  let _t0: int = _module__class_Class1_function_factorial(((n: int) + -1), ((n: int) * (acc: int)));
  return (_t0: int);
}`
  );
});
