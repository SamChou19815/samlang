import {
  MidIRStatement,
  debugPrintMidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_INDEX_ACCESS,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_CAST,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import optimizeMidIRFunctionByCommonSubExpressionElimination from '../mir-common-subexpression-elimination-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

const assertCorrectlyOptimized = (statements: MidIRStatement[], expected: string): void => {
  expect(
    optimizeMidIRFunctionByCommonSubExpressionElimination(
      {
        name: '',
        parameters: [],
        type: { __type__: 'FunctionType', argumentTypes: [], returnType: MIR_INT_TYPE },
        body: statements,
        returnValue: MIR_ZERO,
      },
      new OptimizationResourceAllocator()
    )
      .body.map((it) => debugPrintMidIRStatement(it))
      .join('\n')
  ).toBe(expected);
};

it('optimizeMidIRStatementsByCommonSubExpressionElimination works on if-else statements', () => {
  assertCorrectlyOptimized(
    [
      MIR_IF_ELSE({
        booleanExpression: MIR_VARIABLE('b', MIR_BOOL_TYPE),
        s1: [
          MIR_BINARY({ name: 'a', operator: '+', e1: MIR_ONE, e2: MIR_ZERO }),
          MIR_INDEX_ACCESS({
            name: 'ddd',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_ZERO,
            index: 3,
          }),
          MIR_CAST({ name: 'ddd', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('fff', MIR_INT_TYPE),
            functionArguments: [MIR_VARIABLE('a', MIR_INT_TYPE), MIR_VARIABLE('ddd', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
        ],
        s2: [
          MIR_BINARY({ name: 'fd', operator: '+', e1: MIR_ONE, e2: MIR_ZERO }),
          MIR_INDEX_ACCESS({
            name: 'eee',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_ZERO,
            index: 3,
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('eee', MIR_INT_TYPE),
            functionArguments: [
              MIR_VARIABLE('fd', MIR_INT_TYPE),
              MIR_VARIABLE('eee', MIR_INT_TYPE),
            ],
            returnType: MIR_INT_TYPE,
          }),
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
}`
  );
});
