import { DummySourceReason, ModuleReference } from '../common-nodes';
import {
  isTheSameType,
  prettyPrintType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
  SourceUnknownType,
  UndecidedTypes,
} from '../samlang-nodes';

describe('samlang-nodes', () => {
  it('prettyPrint is working.', () => {
    expect(prettyPrintType(SourceUnitType(DummySourceReason))).toBe('unit');
    expect(prettyPrintType(SourceBoolType(DummySourceReason))).toBe('bool');
    expect(prettyPrintType(SourceIntType(DummySourceReason))).toBe('int');
    expect(prettyPrintType(SourceStringType(DummySourceReason))).toBe('string');
    expect(prettyPrintType(SourceUnknownType(DummySourceReason))).toBe('unknown');
    expect(
      prettyPrintType(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'))
    ).toBe('Foo');
    expect(
      prettyPrintType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo', [
          SourceUnitType(DummySourceReason),
          SourceIntType(DummySourceReason),
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Bar'),
        ])
      )
    ).toBe('Foo<unit, int, Bar>');
    expect(
      prettyPrintType(SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)))
    ).toBe('() -> unit');
    expect(
      prettyPrintType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        )
      )
    ).toBe('(int) -> bool');
    expect(
      prettyPrintType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason), SourceBoolType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        )
      )
    ).toBe('(int, bool) -> bool');
    expect(
      prettyPrintType(
        SourceFunctionType(
          DummySourceReason,
          [
            SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
            SourceBoolType(DummySourceReason),
          ],
          SourceBoolType(DummySourceReason)
        )
      )
    ).toBe('(() -> unit, bool) -> bool');
    expect(
      prettyPrintType({ type: 'UndecidedType', reason: DummySourceReason, index: 65536 })
    ).toBe('__UNDECIDED__');
  });

  it('UndecidedTypes are self consistent.', () => {
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(0);
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(1);
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(2);
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(3);
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(4);
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(5);
    expect(UndecidedTypes.nextN(5).map((it) => it.index)).toEqual([6, 7, 8, 9, 10]);
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();
    expect(UndecidedTypes.next(DummySourceReason).index).toBe(0);
  });

  it('type equality test', () => {
    expect(
      isTheSameType(SourceUnitType(DummySourceReason), SourceUnitType(DummySourceReason))
    ).toBeTruthy();
    expect(
      isTheSameType(SourceUnitType(DummySourceReason), SourceBoolType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceUnitType(DummySourceReason), SourceIntType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceUnitType(DummySourceReason), SourceStringType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceBoolType(DummySourceReason), SourceUnitType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceBoolType(DummySourceReason), SourceBoolType(DummySourceReason))
    ).toBeTruthy();
    expect(
      isTheSameType(SourceBoolType(DummySourceReason), SourceIntType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceBoolType(DummySourceReason), SourceStringType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceIntType(DummySourceReason), SourceUnitType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceIntType(DummySourceReason), SourceBoolType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceIntType(DummySourceReason), SourceIntType(DummySourceReason))
    ).toBeTruthy();
    expect(
      isTheSameType(SourceIntType(DummySourceReason), SourceStringType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceStringType(DummySourceReason), SourceUnitType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceStringType(DummySourceReason), SourceBoolType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceStringType(DummySourceReason), SourceIntType(DummySourceReason))
    ).toBeFalsy();
    expect(
      isTheSameType(SourceStringType(DummySourceReason), SourceStringType(DummySourceReason))
    ).toBeTruthy();

    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        SourceUnitType(DummySourceReason)
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B')
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A')
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
        ])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceBoolType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference(['AAA']), 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ])
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ])
      )
    ).toBeTruthy();

    expect(
      isTheSameType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceUnitType(DummySourceReason)
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceBoolType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        )
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceBoolType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        )
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceFunctionType(DummySourceReason, [], SourceBoolType(DummySourceReason))
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        )
      )
    ).toBeTruthy();

    expect(
      isTheSameType(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        SourceUnitType(DummySourceReason)
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 1 }
      )
    ).toBeFalsy();
    expect(
      isTheSameType(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 }
      )
    ).toBeTruthy();
  });
});
