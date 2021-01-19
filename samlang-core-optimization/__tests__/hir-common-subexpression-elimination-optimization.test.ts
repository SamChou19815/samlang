import optimizeHighIRStatementsByCommonSubExpressionElimination from '../hir-common-subexpression-elimination-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  HighIRStatement,
  debugPrintHighIRStatement,
  HIR_ZERO,
  HIR_ONE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_CAST,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const assertCorrectlyOptimized = (statements: HighIRStatement[], expected: string): void => {
  expect(
    optimizeHighIRStatementsByCommonSubExpressionElimination(
      statements,
      new OptimizationResourceAllocator()
    )
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

it('optimizeHighIRStatementsByCommonSubExpressionElimination works on if-else statements', () => {
  assertCorrectlyOptimized(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
        s1: [
          HIR_BINARY({ name: 'a', operator: '+', e1: HIR_ONE, e2: HIR_ZERO }),
          HIR_INDEX_ACCESS({
            name: 'ddd',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_ZERO,
            index: 3,
          }),
          HIR_CAST({ name: 'ddd', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('a', HIR_INT_TYPE), HIR_VARIABLE('ddd', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
          }),
        ],
        s2: [
          HIR_BINARY({ name: 'fd', operator: '+', e1: HIR_ONE, e2: HIR_ZERO }),
          HIR_INDEX_ACCESS({
            name: 'eee',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_ZERO,
            index: 3,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('eee', HIR_INT_TYPE),
            functionArguments: [
              HIR_VARIABLE('fd', HIR_INT_TYPE),
              HIR_VARIABLE('eee', HIR_INT_TYPE),
            ],
            returnType: HIR_INT_TYPE,
          }),
          HIR_RETURN(HIR_ZERO),
        ],
        finalAssignments: [],
      }),
    ],
    `let _cse_0_: int = 0[3];
let _cse_1_: int = 1 + 0;
if (b: bool) {
  let ddd: int = 0;
  fff((_cse_1_: int), (_cse_0_: int));
} else {
  eee((_cse_1_: int), (_cse_0_: int));
  return 0;
}`
  );
});
