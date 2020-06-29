import {
  prettyPrintType,
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
  UndecidedTypes,
} from '../types';

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
