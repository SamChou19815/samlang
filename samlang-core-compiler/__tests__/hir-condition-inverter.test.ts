import invertHighIRConditionExpression from '../hir-condition-inverter';
import createHighIRFlexibleOrderOperatorNode from '../hir-flexible-op';

import {
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HighIRExpression,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });

it('invertHighIRConditionExpression constant inversion tests', () => {
  expect(invertHighIRConditionExpression(HIR_ZERO)).toEqual(HIR_ONE);
  expect(invertHighIRConditionExpression(HIR_ONE)).toEqual(HIR_ZERO);
  expect(() => invertHighIRConditionExpression(HIR_INT(8))).toThrow();
});

it('invertHighIRConditionExpression non-statically analyzable inversion tests', () => {
  expect(invertHighIRConditionExpression(NAME(''))).toEqual(
    createHighIRFlexibleOrderOperatorNode('^', NAME(''), HIR_ONE)
  );
  expect(invertHighIRConditionExpression(TEMP(''))).toEqual(
    createHighIRFlexibleOrderOperatorNode('^', TEMP(''), HIR_ONE)
  );
  expect(invertHighIRConditionExpression(IMMUTABLE_MEM(TEMP('')))).toEqual(
    createHighIRFlexibleOrderOperatorNode('^', IMMUTABLE_MEM(TEMP('')), HIR_ONE)
  );
});

it('invertHighIRConditionExpression binary expression tests', () => {
  expect(() =>
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_ZERO))
  ).toThrow();
  expect(() =>
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('-', HIR_ZERO, HIR_ZERO))
  ).toThrow();
  expect(() =>
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('*', HIR_ZERO, HIR_ZERO))
  ).toThrow();
  expect(() =>
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('/', HIR_ZERO, HIR_ZERO))
  ).toThrow();
  expect(() =>
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('%', HIR_ZERO, HIR_ZERO))
  ).toThrow();

  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('^', HIR_ZERO, HIR_ONE))
  ).toEqual(HIR_ZERO);
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('^', HIR_ONE, HIR_ZERO))
  ).toEqual(HIR_ZERO);
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('^', HIR_ZERO, HIR_ZERO))
  ).toEqual(
    createHighIRFlexibleOrderOperatorNode(
      '^',
      createHighIRFlexibleOrderOperatorNode('^', HIR_ZERO, HIR_ZERO),
      HIR_ONE
    )
  );

  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('<', HIR_ZERO, HIR_ONE))
  ).toEqual(createHighIRFlexibleOrderOperatorNode('>=', HIR_ZERO, HIR_ONE));
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('<=', HIR_ZERO, HIR_ONE))
  ).toEqual(createHighIRFlexibleOrderOperatorNode('>', HIR_ZERO, HIR_ONE));
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('>', HIR_ZERO, HIR_ONE))
  ).toEqual(createHighIRFlexibleOrderOperatorNode('<=', HIR_ZERO, HIR_ONE));
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('>=', HIR_ZERO, HIR_ONE))
  ).toEqual(createHighIRFlexibleOrderOperatorNode('<', HIR_ZERO, HIR_ONE));
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('==', HIR_ZERO, HIR_ONE))
  ).toEqual(createHighIRFlexibleOrderOperatorNode('!=', HIR_ZERO, HIR_ONE));
  expect(
    invertHighIRConditionExpression(createHighIRFlexibleOrderOperatorNode('!=', HIR_ZERO, HIR_ONE))
  ).toEqual(createHighIRFlexibleOrderOperatorNode('==', HIR_ZERO, HIR_ONE));
});
