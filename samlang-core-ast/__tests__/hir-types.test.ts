import {
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  prettyPrintHighIRType,
  isTheSameHighIRType,
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

it('isTheSameHighIRType works', () => {
  expect(isTheSameHighIRType(HIR_STRING_TYPE, HIR_STRING_TYPE)).toBeTruthy();
  expect(isTheSameHighIRType(HIR_STRING_TYPE, HIR_ANY_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_STRING_TYPE, HIR_INT_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_ANY_TYPE, HIR_STRING_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_ANY_TYPE, HIR_ANY_TYPE)).toBeTruthy();
  expect(isTheSameHighIRType(HIR_ANY_TYPE, HIR_INT_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_INT_TYPE, HIR_STRING_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_INT_TYPE, HIR_ANY_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_INT_TYPE, HIR_INT_TYPE)).toBeTruthy();

  expect(isTheSameHighIRType(HIR_IDENTIFIER_TYPE('A'), HIR_STRING_TYPE)).toBeFalsy();
  expect(isTheSameHighIRType(HIR_IDENTIFIER_TYPE('A'), HIR_IDENTIFIER_TYPE('B'))).toBeFalsy();
  expect(isTheSameHighIRType(HIR_IDENTIFIER_TYPE('A'), HIR_IDENTIFIER_TYPE('A'))).toBeTruthy();

  expect(
    isTheSameHighIRType(HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_ANY_TYPE]), HIR_INT_TYPE)
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
    isTheSameHighIRType(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE), HIR_INT_TYPE)
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
