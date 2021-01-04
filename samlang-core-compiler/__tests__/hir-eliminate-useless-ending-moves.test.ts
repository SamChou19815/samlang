import eliminateUselessEndingMoveForHighIRStatements from '../hir-eliminate-useless-ending-moves';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_LET,
  HIR_NAME,
  HIR_STRUCT_INITIALIZATION,
  debugPrintHighIRStatement,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE, HIR_STRUCT_TYPE, HIR_FUNCTION_TYPE } from 'samlang-core-ast/hir-types';

it('eliminateUselessEndingMoveForHighIRStatements empty array test', () => {
  expect(eliminateUselessEndingMoveForHighIRStatements([])).toEqual([]);
});

it('eliminateUselessEndingMoveForHighIRStatements useless linear sequence test', () => {
  expect(
    eliminateUselessEndingMoveForHighIRStatements([
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
    ])
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe('');
});

it('eliminateUselessEndingMoveForHighIRStatements if-else test 1', () => {
  expect(
    eliminateUselessEndingMoveForHighIRStatements([
      HIR_IF_ELSE({
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
              HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE)
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
    ])
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(`if ((n: int) == 0) {
} else {
  let _t0: int = _module__class_Class1_function_factorial(((n: int) - 1), ((n: int) * (acc: int)));
}`);
});

it('eliminateUselessEndingMoveForHighIRStatements if-else test 2', () => {
  expect(
    eliminateUselessEndingMoveForHighIRStatements([
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'useless',
        type: HIR_STRUCT_TYPE([]),
        expressionList: [],
      }),
      HIR_IF_ELSE({
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
          HIR_LET({
            name: '_t1',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
          }),
        ],
      }),
    ])
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe('');
});
