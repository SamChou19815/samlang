import {
  DummySourceReason,
  Location,
  ModuleReference,
  Position,
  SourceReason,
} from '../common-nodes';
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
  typeReposition,
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
  });

  it('type reposition test', () => {
    expect(
      typeReposition(
        SourceIntType(
          SourceReason(
            new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4)),
            new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4))
          )
        ),
        new Location(ModuleReference.DUMMY, Position(5, 6), Position(7, 8))
      ).reason.useLocation.toString()
    ).toBe('__DUMMY__.sam:6:7-8:9');
  });

  it('type equality test', () => {
    expect(
      isTheSameType(SourceUnknownType(DummySourceReason), SourceUnknownType(DummySourceReason))
    ).toBeTruthy();
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
  });
});
