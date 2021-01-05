import {
  debugPrintHighIRStatement,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
  HIR_INDEX_ACCESS,
  HIR_LET,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
  HIR_ZERO,
  HIR_INT,
  HIR_STRING,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
} from '../hir-expressions';
import { HIR_INT_TYPE, HIR_STRING_TYPE, HIR_IDENTIFIER_TYPE, HIR_STRUCT_TYPE } from '../hir-types';

it('debugPrintHighIRStatement works', () => {
  expect(
    debugPrintHighIRStatement(
      HIR_WHILE_TRUE([
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          multiAssignedVariable: 'bar',
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
                HIR_STRING('meggo'),
              ],
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('h', HIR_INT_TYPE),
              functionArguments: [
                HIR_INDEX_ACCESS({
                  type: HIR_INT_TYPE,
                  expression: HIR_VARIABLE('d', HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_INT_TYPE])),
                  index: 0,
                }),
              ],
              returnCollector: { name: 'vibez', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('h', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('d', HIR_INT_TYPE)],
            }),
          ],
        }),
      ])
    )
  ).toBe(`while true {
  if 0 {
    let foo: Bar = (dev: Bar);
    return (foo: Bar);
  } else {
    let baz: (int, string) = [(0 + 0), 'meggo'];
    let vibez: int = h(((d: (int, int))[0]: int));
    h((d: int));
  }
  // phi(bar)
}`);
});
