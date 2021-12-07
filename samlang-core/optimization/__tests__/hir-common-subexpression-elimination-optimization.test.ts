import {
  debugPrintHighIRStatement,
  HighIRStatement,
  HIR_BINARY,
  HIR_BOOL_TYPE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT_TYPE,
  HIR_NAME,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_ZERO,
} from '../../ast/hir-nodes';
import optimizeHighIRFunctionByCommonSubExpressionElimination from '../hir-common-subexpression-elimination-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

function assertCorrectlyOptimized(statements: HighIRStatement[], expected: string): void {
  expect(
    optimizeHighIRFunctionByCommonSubExpressionElimination(
      {
        name: '',
        parameters: [],
        typeParameters: [],
        type: { __type__: 'FunctionType', argumentTypes: [], returnType: HIR_INT_TYPE },
        body: statements,
        returnValue: HIR_ZERO,
      },
      new OptimizationResourceAllocator()
    )
      .body.map((it) => debugPrintHighIRStatement(it))
      .join('\n')
  ).toBe(expected);
}

describe('hir-common-subexpression-elimination', () => {
  it('optimizeHighIRStatementsByCommonSubExpressionElimination works on if-else statements', () => {
    assertCorrectlyOptimized(
      [
        HIR_IF_ELSE({
          booleanExpression: HIR_VARIABLE('b', HIR_BOOL_TYPE),
          s1: [
            HIR_BINARY({ name: 'ddddd', operator: '+', e1: HIR_ONE, e2: HIR_ONE }),
            HIR_BINARY({ name: 'a', operator: '+', e1: HIR_ONE, e2: HIR_ZERO }),
            HIR_INDEX_ACCESS({
              name: 'ddd',
              type: HIR_INT_TYPE,
              pointerExpression: HIR_ZERO,
              index: 3,
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
              functionArguments: [
                HIR_VARIABLE('a', HIR_INT_TYPE),
                HIR_VARIABLE('ddd', HIR_INT_TYPE),
              ],
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
          ],
          finalAssignments: [],
        }),
      ],
      `let _cse_0_: int = 0[3];
let _cse_1_: int = 1 + 0;
if (b: bool) {
  let ddddd: int = 1 + 1;
  fff((_cse_1_: int), (_cse_0_: int));
} else {
  eee((_cse_1_: int), (_cse_0_: int));
}`
    );
  });
});
