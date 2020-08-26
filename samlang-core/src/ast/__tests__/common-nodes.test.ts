import {
  prettyPrintLiteral,
  TRUE,
  FALSE,
  intLiteralOf,
  stringLiteralOf,
  prettyPrintType,
  isTheSameType,
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
  UndecidedTypes,
} from '../common-nodes';

it('Literals have expected pretty printed values', () => {
  expect(prettyPrintLiteral(TRUE)).toBe('true');
  expect(prettyPrintLiteral(FALSE)).toBe('false');
  expect(prettyPrintLiteral(intLiteralOf(BigInt(42)))).toBe('42');
  expect(prettyPrintLiteral(stringLiteralOf('hello'))).toBe('"hello"');
});

it('prettyPrint is working.', () => {
  expect(prettyPrintType(unitType)).toBe('unit');
  expect(prettyPrintType(boolType)).toBe('bool');
  expect(prettyPrintType(intType)).toBe('int');
  expect(prettyPrintType(stringType)).toBe('string');
  expect(prettyPrintType(identifierType('Foo'))).toBe('Foo');
  expect(prettyPrintType(identifierType('Foo', [unitType, intType, identifierType('Bar')]))).toBe(
    'Foo<unit, int, Bar>'
  );
  expect(prettyPrintType(tupleType([unitType, intType]))).toBe('[unit * int]');
  expect(prettyPrintType(functionType([], unitType))).toBe('() -> unit');
  expect(prettyPrintType(functionType([intType], boolType))).toBe('(int) -> bool');
  expect(prettyPrintType(functionType([intType, boolType], boolType))).toBe('(int, bool) -> bool');
  expect(prettyPrintType(functionType([functionType([], unitType), boolType], boolType))).toBe(
    '(() -> unit, bool) -> bool'
  );
  expect(prettyPrintType({ type: 'UndecidedType', index: 65536 })).toBe('__UNDECIDED__');
});

it('UndecidedTypes are self consistent.', () => {
  expect(UndecidedTypes.next().index).toBe(0);
  expect(UndecidedTypes.next().index).toBe(1);
  expect(UndecidedTypes.next().index).toBe(2);
  expect(UndecidedTypes.next().index).toBe(3);
  expect(UndecidedTypes.next().index).toBe(4);
  expect(UndecidedTypes.next().index).toBe(5);
  expect(UndecidedTypes.nextN(5).map((it) => it.index)).toEqual([6, 7, 8, 9, 10]);
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();
  expect(UndecidedTypes.next().index).toBe(0);
});

it('type equality test', () => {
  expect(isTheSameType(unitType, unitType)).toBeTruthy();
  expect(isTheSameType(unitType, boolType)).toBeFalsy();
  expect(isTheSameType(unitType, intType)).toBeFalsy();
  expect(isTheSameType(unitType, stringType)).toBeFalsy();
  expect(isTheSameType(boolType, unitType)).toBeFalsy();
  expect(isTheSameType(boolType, boolType)).toBeTruthy();
  expect(isTheSameType(boolType, intType)).toBeFalsy();
  expect(isTheSameType(boolType, stringType)).toBeFalsy();
  expect(isTheSameType(intType, unitType)).toBeFalsy();
  expect(isTheSameType(intType, boolType)).toBeFalsy();
  expect(isTheSameType(intType, intType)).toBeTruthy();
  expect(isTheSameType(intType, stringType)).toBeFalsy();
  expect(isTheSameType(stringType, unitType)).toBeFalsy();
  expect(isTheSameType(stringType, boolType)).toBeFalsy();
  expect(isTheSameType(stringType, intType)).toBeFalsy();
  expect(isTheSameType(stringType, stringType)).toBeTruthy();

  expect(isTheSameType(identifierType('A', [intType, boolType]), unitType)).toBeFalsy();
  expect(isTheSameType(identifierType('A', [intType, boolType]), identifierType('B'))).toBeFalsy();
  expect(isTheSameType(identifierType('A', [intType, boolType]), identifierType('A'))).toBeFalsy();
  expect(
    isTheSameType(identifierType('A', [intType, boolType]), identifierType('A', [intType]))
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType('A', [boolType, intType]),
      identifierType('A', [intType, boolType])
    )
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType('A', [intType, boolType]),
      identifierType('A', [intType, boolType])
    )
  ).toBeTruthy();

  expect(isTheSameType(tupleType([intType, boolType]), unitType)).toBeFalsy();
  expect(isTheSameType(tupleType([intType, boolType]), tupleType([]))).toBeFalsy();
  expect(isTheSameType(tupleType([intType, boolType]), tupleType([intType]))).toBeFalsy();
  expect(isTheSameType(tupleType([intType, boolType]), tupleType([boolType, intType]))).toBeFalsy();
  expect(
    isTheSameType(tupleType([intType, boolType]), tupleType([intType, boolType]))
  ).toBeTruthy();

  expect(isTheSameType(functionType([intType], boolType), unitType)).toBeFalsy();
  expect(
    isTheSameType(functionType([intType], boolType), functionType([boolType], intType))
  ).toBeFalsy();
  expect(
    isTheSameType(functionType([intType], boolType), functionType([boolType], boolType))
  ).toBeFalsy();
  expect(isTheSameType(functionType([intType], boolType), functionType([], boolType))).toBeFalsy();
  expect(
    isTheSameType(functionType([intType], boolType), functionType([intType], boolType))
  ).toBeTruthy();

  expect(isTheSameType({ type: 'UndecidedType', index: 0 }, unitType)).toBeFalsy();
  expect(
    isTheSameType({ type: 'UndecidedType', index: 0 }, { type: 'UndecidedType', index: 1 })
  ).toBeFalsy();
  expect(
    isTheSameType({ type: 'UndecidedType', index: 0 }, { type: 'UndecidedType', index: 0 })
  ).toBeTruthy();
});
