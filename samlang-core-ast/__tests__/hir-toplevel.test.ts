import { HIR_RETURN, HIR_ZERO } from '../hir-expressions';
import { debugPrintHighIRModule } from '../hir-toplevel';
import { HIR_ANY_TYPE, HIR_INT_TYPE, HIR_FUNCTION_TYPE } from '../hir-types';

it('debugPrintHighIRModule works', () => {
  expect(
    debugPrintHighIRModule({
      typeDefinitions: [{ identifier: 'Foo', mappings: [HIR_INT_TYPE, HIR_ANY_TYPE] }],
      functions: [
        {
          name: 'Bar',
          parameters: ['f'],
          hasReturn: true,
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
          body: [HIR_RETURN(HIR_ZERO)],
        },
      ],
    })
  ).toBe(`type Foo = (int, any);

function Bar(f: int): int {
  return 0;
}
`);
});
