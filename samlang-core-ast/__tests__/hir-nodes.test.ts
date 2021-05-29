import {
  prettyPrintHighIRType,
  prettyPrintHighIRTypeDefinition,
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

it('prettyPrintHighIRTypeDefinition works', () => {
  expect(
    prettyPrintHighIRTypeDefinition({
      identifier: 'A',
      type: 'object',
      typeParameters: [],
      mappings: [HIR_INT_TYPE, HIR_BOOL_TYPE],
    })
  ).toBe('object type A = [int, bool]');
  expect(
    prettyPrintHighIRTypeDefinition({
      identifier: 'B',
      type: 'variant',
      typeParameters: ['C'],
      mappings: [HIR_INT_TYPE, HIR_IDENTIFIER_TYPE('C', [])],
    })
  ).toBe('variant type B<C> = [int, C]');
});
