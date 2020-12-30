import eliminateUselessEndingMoveForHighIRStatements from '../hir-eliminate-useless-ending-moves';

import { functionType, intType } from 'samlang-core-ast/common-nodes';
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
} from 'samlang-core-ast/hir-expressions';

it('eliminateUselessEndingMoveForHighIRStatements empty array test', () => {
  expect(eliminateUselessEndingMoveForHighIRStatements([])).toEqual([]);
});

it('eliminateUselessEndingMoveForHighIRStatements useless linear sequence test', () => {
  expect(
    eliminateUselessEndingMoveForHighIRStatements([
      HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
      HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value', intType) }),
      HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2', intType) }),
      HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1', intType) }),
      HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one', intType) }),
      HIR_STRUCT_INITIALIZATION({ structVariableName: 'useless', expressionList: [] }),
    ])
  ).toEqual([]);
});

it('eliminateUselessEndingMoveForHighIRStatements if-else test 1', () => {
  expect(
    eliminateUselessEndingMoveForHighIRStatements([
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_VARIABLE('n', intType),
          e2: HIR_ZERO,
        }),
        s1: [
          HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
          HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value', intType) }),
          HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2', intType) }),
          HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1', intType) }),
          HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one', intType) }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              '_module__class_Class1_function_factorial',
              functionType([intType], intType)
            ),
            functionArguments: [
              HIR_BINARY({
                operator: '-',
                e1: HIR_VARIABLE('n', intType),
                e2: HIR_ONE,
              }),
              HIR_BINARY({
                operator: '*',
                e1: HIR_VARIABLE('n', intType),
                e2: HIR_VARIABLE('acc', intType),
              }),
            ],
            returnCollector: '_t0',
          }),
          HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('_t0', intType) }),
        ],
      }),
    ])
  ).toEqual([
    HIR_IF_ELSE({
      booleanExpression: HIR_BINARY({
        operator: '==',
        e1: HIR_VARIABLE('n', intType),
        e2: HIR_ZERO,
      }),
      s1: [],
      s2: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_module__class_Class1_function_factorial',
            functionType([intType], intType)
          ),
          functionArguments: [
            HIR_BINARY({
              operator: '-',
              e1: HIR_VARIABLE('n', intType),
              e2: HIR_ONE,
            }),
            HIR_BINARY({
              operator: '*',
              e1: HIR_VARIABLE('n', intType),
              e2: HIR_VARIABLE('acc', intType),
            }),
          ],
          returnCollector: '_t0',
        }),
      ],
    }),
  ]);
});

it('eliminateUselessEndingMoveForHighIRStatements if-else test 2', () => {
  expect(
    eliminateUselessEndingMoveForHighIRStatements([
      HIR_STRUCT_INITIALIZATION({ structVariableName: 'useless', expressionList: [] }),
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_VARIABLE('n', intType),
          e2: HIR_ZERO,
        }),
        s1: [
          HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
          HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value', intType) }),
          HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2', intType) }),
          HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1', intType) }),
          HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one', intType) }),
        ],
        s2: [HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('_t0', intType) })],
      }),
    ])
  ).toEqual([]);
});
