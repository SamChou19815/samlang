import {
  prettyPrintHighIRType,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_FUNCTION_TYPE,
} from '../hir-nodes';

it('prettyPrintHighIRType works', () => {
  expect(
    prettyPrintHighIRType(
      HIR_FUNCTION_TYPE(
        [HIR_INT_TYPE, HIR_BOOL_TYPE],
        HIR_FUNCTION_TYPE(
          [HIR_IDENTIFIER_TYPE('Foo', [HIR_STRING_TYPE]), HIR_IDENTIFIER_TYPE('Foo', [])],
          HIR_STRING_TYPE
        )
      )
    )
  ).toBe('(int, bool) -> (Foo<string>, Foo) -> string');
});
