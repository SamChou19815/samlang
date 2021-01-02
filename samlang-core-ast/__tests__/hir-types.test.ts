import {
  HIR_VOID_TYPE,
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_POINTER_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  prettyPrintHighIRType,
  isTheSameHighIRType,
} from '../hir-types';

it('prettyPrintHighIRType works', () => {
  expect(
    prettyPrintHighIRType(
      HIR_FUNCTION_TYPE(
        [HIR_STRUCT_TYPE([HIR_VOID_TYPE, HIR_INT_TYPE])],
        HIR_FUNCTION_TYPE(
          [HIR_IDENTIFIER_TYPE('Foo'), HIR_POINTER_TYPE(HIR_ANY_TYPE)],
          HIR_VOID_TYPE
        )
      )
    )
  ).toBe('((void, int)) -> (Foo, Boxed<any>) -> void');
});

it('isTheSameHighIRType works', () => {
  expect(isTheSameHighIRType(HIR_VOID_TYPE, HIR_VOID_TYPE)).toBeTruthy();
  expect(isTheSameHighIRType(HIR_VOID_TYPE, HIR_ANY_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_VOID_TYPE, HIR_INT_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_ANY_TYPE, HIR_VOID_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_ANY_TYPE, HIR_ANY_TYPE)).toBeTruthy();
  expect(isTheSameHighIRType(HIR_ANY_TYPE, HIR_INT_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_INT_TYPE, HIR_VOID_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_INT_TYPE, HIR_ANY_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_INT_TYPE, HIR_INT_TYPE)).toBeTruthy();

  expect(isTheSameHighIRType(HIR_IDENTIFIER_TYPE('A'), HIR_VOID_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_IDENTIFIER_TYPE('A'), HIR_IDENTIFIER_TYPE('B'))).toBeFalsy();
  expect(isTheSameHighIRType(HIR_IDENTIFIER_TYPE('A'), HIR_IDENTIFIER_TYPE('A'))).toBeTruthy();

  expect(isTheSameHighIRType(HIR_POINTER_TYPE(HIR_INT_TYPE), HIR_INT_TYPE)).toBeFalsy();
  expect(
    isTheSameHighIRType(HIR_POINTER_TYPE(HIR_INT_TYPE), HIR_POINTER_TYPE(HIR_INT_TYPE))
  ).toBeTruthy();

  expect(
    isTheSameHighIRType(HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE]), HIR_VOID_TYPE)
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE]), HIR_STRUCT_TYPE([]))
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE]),
      HIR_STRUCT_TYPE([HIR_INT_TYPE])
    )
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE]),
      HIR_STRUCT_TYPE([HIR_ANY_TYPE, HIR_INT_TYPE])
    )
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE]),
      HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE])
    )
  ).toBeTruthy();

  expect(
    isTheSameHighIRType(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE), HIR_VOID_TYPE)
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE),
      HIR_FUNCTION_TYPE([HIR_ANY_TYPE], HIR_INT_TYPE)
    )
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE),
      HIR_FUNCTION_TYPE([HIR_ANY_TYPE], HIR_ANY_TYPE)
    )
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE),
      HIR_FUNCTION_TYPE([], HIR_ANY_TYPE)
    )
  ).toBeFalsy();
  expect(
    isTheSameHighIRType(
      HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE),
      HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE)
    )
  ).toBeTruthy();
});