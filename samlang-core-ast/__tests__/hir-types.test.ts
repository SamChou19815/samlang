import {
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  prettyPrintHighIRType,
} from '../hir-types';

it('prettyPrintHighIRType works', () => {
  expect(
    prettyPrintHighIRType(
      HIR_FUNCTION_TYPE(
        [HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_INT_TYPE])],
        HIR_FUNCTION_TYPE([HIR_IDENTIFIER_TYPE('Foo'), HIR_ANY_TYPE], HIR_STRING_TYPE)
      )
    )
  ).toBe('((int, int)) -> (Foo, any) -> string');
});
