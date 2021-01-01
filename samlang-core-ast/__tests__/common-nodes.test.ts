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
  Position,
  Range,
  ModuleReference,
} from '../common-nodes';

import { Long } from 'samlang-core-utils';

it('Literals have expected pretty printed values', () => {
  expect(prettyPrintLiteral(TRUE)).toBe('true');
  expect(prettyPrintLiteral(FALSE)).toBe('false');
  expect(prettyPrintLiteral(intLiteralOf(Long.fromInt(42)))).toBe('42');
  expect(prettyPrintLiteral(stringLiteralOf('hello'))).toBe('"hello"');
});

it('prettyPrint is working.', () => {
  expect(prettyPrintType(unitType)).toBe('unit');
  expect(prettyPrintType(boolType)).toBe('bool');
  expect(prettyPrintType(intType)).toBe('int');
  expect(prettyPrintType(stringType)).toBe('string');
  expect(prettyPrintType(identifierType(ModuleReference.ROOT, 'Foo'))).toBe('Foo');
  expect(
    prettyPrintType(
      identifierType(ModuleReference.ROOT, 'Foo', [
        unitType,
        intType,
        identifierType(ModuleReference.ROOT, 'Bar'),
      ])
    )
  ).toBe('Foo<unit, int, Bar>');
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

  expect(
    isTheSameType(identifierType(ModuleReference.ROOT, 'A', [intType, boolType]), unitType)
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      identifierType(ModuleReference.ROOT, 'B')
    )
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      identifierType(ModuleReference.ROOT, 'A')
    )
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      identifierType(ModuleReference.ROOT, 'A', [intType])
    )
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType(ModuleReference.ROOT, 'A', [boolType, intType]),
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
    )
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      identifierType(new ModuleReference(['AAA']), 'A', [intType, boolType])
    )
  ).toBeFalsy();
  expect(
    isTheSameType(
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
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

it('Correct toString() for display', () => {
  expect(Position.DUMMY.toString()).toBe('0:0');
  expect(new Position(42, 53).toString()).toBe('43:54');
});

it('Position comparison smoke test', () => {
  expect(new Position(1, 4).compareTo(new Position(1, 4))).toBe(0);
});

it('Correct same line comparision test', () => {
  expect(new Position(1, 2).compareTo(new Position(1, 3))).toBeLessThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 2))).toBeGreaterThan(0);
  expect(new Position(1, 2).compareTo(new Position(1, 3))).toBeLessThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 2))).toBeGreaterThan(0);
  expect(new Position(1, 4).compareTo(new Position(1, 3))).toBeGreaterThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 4))).toBeLessThan(0);
  expect(new Position(1, 4).compareTo(new Position(1, 3))).toBeGreaterThan(0);
  expect(new Position(1, 3).compareTo(new Position(1, 4))).toBeLessThan(0);
});

it('Correct different lines comparision test', () => {
  expect(new Position(1, 2).compareTo(new Position(2, 3))).toBeLessThan(0);
  expect(new Position(1, 3).compareTo(new Position(2, 3))).toBeLessThan(0);
  expect(new Position(1, 4).compareTo(new Position(2, 3))).toBeLessThan(0);
  expect(new Position(2, 3).compareTo(new Position(1, 2))).toBeGreaterThan(0);
  expect(new Position(2, 3).compareTo(new Position(1, 3))).toBeGreaterThan(0);
  expect(new Position(2, 3).compareTo(new Position(1, 4))).toBeGreaterThan(0);
});

it('Range.toString() works as expected', () => {
  expect(Range.DUMMY.toString()).toBe('0:0-0:0');
  expect(new Range(new Position(1, 1), new Position(2, 4)).toString()).toBe('2:2-3:5');
});

it('Range.containsPosition() works as expected', () => {
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsPosition(new Position(2, 2))
  ).toBeTruthy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsPosition(new Position(1, 2))
  ).toBeFalsy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsPosition(new Position(3, 2))
  ).toBeFalsy();
});

it('Range.containsRange() works as expected', () => {
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 3), new Position(3, 1))
    )
  ).toBeTruthy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 4), new Position(3, 0))
    )
  ).toBeTruthy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 3), new Position(3, 2))
    )
  ).toBeFalsy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 2), new Position(3, 1))
    )
  ).toBeFalsy();
  expect(
    new Range(new Position(1, 3), new Position(3, 1)).containsRange(
      new Range(new Position(1, 2), new Position(3, 2))
    )
  ).toBeFalsy();
});

it('Range.union() works as expected', () => {
  expect(
    new Range(new Position(1, 3), new Position(3, 1))
      .union(new Range(new Position(2, 3), new Position(4, 1)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());

  expect(
    new Range(new Position(2, 3), new Position(4, 1))
      .union(new Range(new Position(1, 3), new Position(3, 1)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());

  expect(
    new Range(new Position(1, 3), new Position(2, 3))
      .union(new Range(new Position(3, 1), new Position(4, 1)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());

  expect(
    new Range(new Position(3, 1), new Position(4, 1))
      .union(new Range(new Position(1, 3), new Position(2, 3)))
      .toString()
  ).toBe(new Range(new Position(1, 3), new Position(4, 1)).toString());
});

it('ModuleReference.toString()', () => {
  expect(ModuleReference.ROOT.toString()).toBe('');
  expect(new ModuleReference(['Foo']).toString()).toBe('Foo');
  expect(new ModuleReference(['Foo', 'Bar']).toString()).toBe('Foo.Bar');
});

it('ModuleReference.toFilename', () => {
  expect(ModuleReference.ROOT.toFilename()).toBe('.sam');
  expect(new ModuleReference(['Foo']).toFilename()).toBe('Foo.sam');
  expect(new ModuleReference(['Foo', 'Bar']).toFilename()).toBe('Foo/Bar.sam');
});

it('ModuleReference.uniqueHash is ModuleReference.toString', () => {
  expect(new ModuleReference(['Foo', 'Bar']).toString()).toBe(
    new ModuleReference(['Foo', 'Bar']).uniqueHash()
  );
});
