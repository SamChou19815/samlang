import { HIR_CAST, HIR_ZERO } from '../hir-expressions';
import { debugPrintHighIRModule } from '../hir-toplevel';
import { HIR_ANY_TYPE, HIR_INT_TYPE, HIR_FUNCTION_TYPE } from '../hir-types';

it('debugPrintHighIRModule works', () => {
  expect(
    debugPrintHighIRModule({
      globalVariables: [{ name: 'dev_meggo', content: 'vibez' }],
      typeDefinitions: [{ identifier: 'Foo', mappings: [HIR_INT_TYPE, HIR_ANY_TYPE] }],
      functions: [
        {
          name: 'Bar',
          parameters: ['f'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
          body: [HIR_CAST({ name: 'a', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
          returnValue: HIR_ZERO,
        },
      ],
    })
  ).toBe(`const dev_meggo = 'vibez';

type Foo = (int, any);

function Bar(f: int): int {
  let a: int = 0;
  return 0;
}
`);
});
