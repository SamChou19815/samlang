import {
  MIR_INT_TYPE,
  MIR_BOOL_TYPE,
  MIR_ANY_TYPE,
  MIR_STRING_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_FUNCTION_TYPE,
  prettyPrintMidIRType,
  isTheSameMidIRType,
} from '../mir-types';

it('prettyPrintMidIRType works', () => {
  expect(
    prettyPrintMidIRType(
      MIR_FUNCTION_TYPE(
        [MIR_INT_TYPE, MIR_INT_TYPE],
        MIR_FUNCTION_TYPE([MIR_IDENTIFIER_TYPE('Foo'), MIR_ANY_TYPE], MIR_STRING_TYPE)
      )
    )
  ).toBe('(int, int) -> (Foo, any) -> string');
});

it('isTheSameMidIRType works', () => {
  expect(isTheSameMidIRType(MIR_ANY_TYPE, MIR_STRING_TYPE)).toBeTruthy();
  expect(isTheSameMidIRType(MIR_STRING_TYPE, MIR_ANY_TYPE)).toBeTruthy();
  expect(isTheSameMidIRType(MIR_STRING_TYPE, MIR_STRING_TYPE)).toBeTruthy();
  expect(isTheSameMidIRType(MIR_ANY_TYPE, MIR_ANY_TYPE)).toBeTruthy();

  expect(isTheSameMidIRType(MIR_INT_TYPE, MIR_ANY_TYPE)).toBeFalsy();
  expect(isTheSameMidIRType(MIR_INT_TYPE, MIR_BOOL_TYPE)).toBeFalsy();
  expect(isTheSameMidIRType(MIR_INT_TYPE, MIR_INT_TYPE)).toBeTruthy();
  expect(isTheSameMidIRType(MIR_BOOL_TYPE, MIR_BOOL_TYPE)).toBeTruthy();
  expect(isTheSameMidIRType(MIR_BOOL_TYPE, MIR_INT_TYPE)).toBeFalsy();

  expect(isTheSameMidIRType(MIR_IDENTIFIER_TYPE('A'), MIR_ANY_TYPE)).toBeFalsy();
  expect(isTheSameMidIRType(MIR_IDENTIFIER_TYPE('A'), MIR_IDENTIFIER_TYPE('B'))).toBeFalsy();
  expect(isTheSameMidIRType(MIR_IDENTIFIER_TYPE('A'), MIR_IDENTIFIER_TYPE('A'))).toBeTruthy();

  expect(
    isTheSameMidIRType(MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE), MIR_INT_TYPE)
  ).toBeFalsy();
  expect(
    isTheSameMidIRType(
      MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
      MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_INT_TYPE)
    )
  ).toBeFalsy();
  expect(
    isTheSameMidIRType(
      MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
      MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_BOOL_TYPE)
    )
  ).toBeFalsy();
  expect(
    isTheSameMidIRType(
      MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
      MIR_FUNCTION_TYPE([], MIR_BOOL_TYPE)
    )
  ).toBeFalsy();
  expect(
    isTheSameMidIRType(
      MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE),
      MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE)
    )
  ).toBeTruthy();
});
