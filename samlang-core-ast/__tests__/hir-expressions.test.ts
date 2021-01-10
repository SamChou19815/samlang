import {
  debugPrintHighIRStatement,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_LET,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
  HIR_ZERO,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
} from '../hir-expressions';
import { HIR_INT_TYPE, HIR_STRING_TYPE, HIR_IDENTIFIER_TYPE, HIR_STRUCT_TYPE } from '../hir-types';

it('debugPrintHighIRStatement works', () => {
  expect(
    debugPrintHighIRStatement(
      HIR_IF_ELSE({
        booleanExpression: HIR_ZERO,
        multiAssignedVariable: {
          name: 'bar',
          type: HIR_INT_TYPE,
          branch1Variable: 'b1',
          branch2Variable: 'b2',
        },
        s1: [
          HIR_LET({
            name: 'foo',
            type: HIR_IDENTIFIER_TYPE('Bar'),
            assignedExpression: HIR_VARIABLE('dev', HIR_IDENTIFIER_TYPE('Bar')),
          }),
          HIR_RETURN(HIR_VARIABLE('foo', HIR_IDENTIFIER_TYPE('Bar'))),
        ],
        s2: [
          HIR_STRUCT_INITIALIZATION({
            structVariableName: 'baz',
            type: HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_STRING_TYPE]),
            expressionList: [
              HIR_BINARY({ operator: '+', e1: HIR_INT(0), e2: HIR_INT(0) }),
              HIR_NAME('meggo', HIR_STRING_TYPE),
            ],
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('h', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('big', HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_INT_TYPE]))],
            returnCollector: { name: 'vibez', type: HIR_INT_TYPE },
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('stresso', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('d', HIR_INT_TYPE)],
          }),
          HIR_INDEX_ACCESS({
            name: 'f',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_VARIABLE('big', HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_INT_TYPE])),
            index: 0,
          }),
        ],
      })
    )
  ).toBe(`if 0 {
  let foo: Bar = (dev: Bar);
  return (foo: Bar);
} else {
  let baz: (int, string) = [(0 + 0), meggo];
  let vibez: int = h((big: (int, int)));
  stresso((d: int));
  let f: int = (big: (int, int))[0];
}
// bar: int = phi(b1, b2)`);
});
