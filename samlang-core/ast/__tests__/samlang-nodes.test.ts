import { ModuleReference } from '../common-nodes';
import {
  isTheSameType,
  prettyPrintType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
  UndecidedTypes,
} from '../samlang-nodes';

describe('samlang-nodes', () => {
  it('prettyPrint is working.', () => {
    expect(prettyPrintType(SourceUnitType)).toBe('unit');
    expect(prettyPrintType(SourceBoolType)).toBe('bool');
    expect(prettyPrintType(SourceIntType)).toBe('int');
    expect(prettyPrintType(SourceStringType)).toBe('string');
    expect(prettyPrintType(SourceIdentifierType(ModuleReference.DUMMY, 'Foo'))).toBe('Foo');
    expect(
      prettyPrintType(
        SourceIdentifierType(ModuleReference.DUMMY, 'Foo', [
          SourceUnitType,
          SourceIntType,
          SourceIdentifierType(ModuleReference.DUMMY, 'Bar'),
        ])
      )
    ).toBe('Foo<unit, int, Bar>');
    expect(prettyPrintType(SourceTupleType([SourceUnitType, SourceIntType]))).toBe('[unit * int]');
    expect(prettyPrintType(SourceFunctionType([], SourceUnitType))).toBe('() -> unit');
    expect(prettyPrintType(SourceFunctionType([SourceIntType], SourceBoolType))).toBe(
      '(int) -> bool'
    );
    expect(
      prettyPrintType(SourceFunctionType([SourceIntType, SourceBoolType], SourceBoolType))
    ).toBe('(int, bool) -> bool');
    expect(
      prettyPrintType(
        SourceFunctionType([SourceFunctionType([], SourceUnitType), SourceBoolType], SourceBoolType)
      )
    ).toBe('(() -> unit, bool) -> bool');
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
    expect(isTheSameType(SourceUnitType, SourceUnitType)).toBeTruthy();
    expect(isTheSameType(SourceUnitType, SourceBoolType)).toBeFalsy();
    expect(isTheSameType(SourceUnitType, SourceIntType)).toBeFalsy();
    expect(isTheSameType(SourceUnitType, SourceStringType)).toBeFalsy();
    expect(isTheSameType(SourceBoolType, SourceUnitType)).toBeFalsy();
    expect(isTheSameType(SourceBoolType, SourceBoolType)).toBeTruthy();
    expect(isTheSameType(SourceBoolType, SourceIntType)).toBeFalsy();
    expect(isTheSameType(SourceBoolType, SourceStringType)).toBeFalsy();
    expect(isTheSameType(SourceIntType, SourceUnitType)).toBeFalsy();
    expect(isTheSameType(SourceIntType, SourceBoolType)).toBeFalsy();
    expect(isTheSameType(SourceIntType, SourceIntType)).toBeTruthy();
    expect(isTheSameType(SourceIntType, SourceStringType)).toBeFalsy();
    expect(isTheSameType(SourceStringType, SourceUnitType)).toBeFalsy();
    expect(isTheSameType(SourceStringType, SourceBoolType)).toBeFalsy();
    expect(isTheSameType(SourceStringType, SourceIntType)).toBeFalsy();
    expect(isTheSameType(SourceStringType, SourceStringType)).toBeTruthy();

    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType]),
        SourceUnitType
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType]),
        SourceIdentifierType(ModuleReference.DUMMY, 'B')
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType]),
        SourceIdentifierType(ModuleReference.DUMMY, 'A')
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType]),
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceBoolType, SourceIntType]),
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType]),
        SourceIdentifierType(new ModuleReference(['AAA']), 'A', [SourceIntType, SourceBoolType])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType]),
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceBoolType])
      )
    ).toBeTruthy();

    expect(
      isTheSameType(SourceTupleType([SourceIntType, SourceBoolType]), SourceUnitType)
    ).toBeFalsy();
    expect(
      isTheSameType(SourceTupleType([SourceIntType, SourceBoolType]), SourceTupleType([]))
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceTupleType([SourceIntType, SourceBoolType]),
        SourceTupleType([SourceIntType])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceTupleType([SourceIntType, SourceBoolType]),
        SourceTupleType([SourceBoolType, SourceIntType])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceTupleType([SourceIntType, SourceBoolType]),
        SourceTupleType([SourceIntType, SourceBoolType])
      )
    ).toBeTruthy();

    expect(
      isTheSameType(SourceFunctionType([SourceIntType], SourceBoolType), SourceUnitType)
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType([SourceIntType], SourceBoolType),
        SourceFunctionType([SourceBoolType], SourceIntType)
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType([SourceIntType], SourceBoolType),
        SourceFunctionType([SourceBoolType], SourceBoolType)
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType([SourceIntType], SourceBoolType),
        SourceFunctionType([], SourceBoolType)
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType([SourceIntType], SourceBoolType),
        SourceFunctionType([SourceIntType], SourceBoolType)
      )
    ).toBeTruthy();

    expect(isTheSameType({ type: 'UndecidedType', index: 0 }, SourceUnitType)).toBeFalsy();
    expect(
      isTheSameType({ type: 'UndecidedType', index: 0 }, { type: 'UndecidedType', index: 1 })
    ).toBeFalsy();
    expect(
      isTheSameType({ type: 'UndecidedType', index: 0 }, { type: 'UndecidedType', index: 0 })
    ).toBeTruthy();
  });
});
