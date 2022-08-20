import {
  DummySourceReason,
  Location,
  ModuleReference,
  Position,
  SourceReason,
} from '../common-nodes';
import {
  AstBuilder,
  isTheSameType,
  prettyPrintType,
  prettyPrintTypeParameter,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceUnknownType,
  typeReposition,
} from '../samlang-nodes';

describe('samlang-nodes', () => {
  it('prettyPrint is working.', () => {
    expect(prettyPrintType(AstBuilder.UnitType)).toBe('unit');
    expect(prettyPrintType(AstBuilder.BoolType)).toBe('bool');
    expect(prettyPrintType(AstBuilder.IntType)).toBe('int');
    expect(prettyPrintType(AstBuilder.StringType)).toBe('string');
    expect(prettyPrintType(SourceUnknownType(DummySourceReason))).toBe('unknown');
    expect(prettyPrintType(AstBuilder.IdType('Foo'))).toBe('Foo');
    expect(
      prettyPrintType(
        AstBuilder.IdType('Foo', [
          AstBuilder.UnitType,
          AstBuilder.IntType,
          AstBuilder.IdType('Bar'),
        ]),
      ),
    ).toBe('Foo<unit, int, Bar>');
    expect(prettyPrintType(AstBuilder.FunType([], AstBuilder.UnitType))).toBe('() -> unit');
    expect(prettyPrintType(AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType))).toBe(
      '(int) -> bool',
    );
    expect(
      prettyPrintType(
        AstBuilder.FunType([AstBuilder.IntType, AstBuilder.BoolType], AstBuilder.BoolType),
      ),
    ).toBe('(int, bool) -> bool');
    expect(
      prettyPrintType(
        AstBuilder.FunType(
          [AstBuilder.FunType([], AstBuilder.UnitType), AstBuilder.BoolType],
          AstBuilder.BoolType,
        ),
      ),
    ).toBe('(() -> unit, bool) -> bool');
    expect(
      prettyPrintTypeParameter({
        name: SourceId('Foo'),
        bound: null,
        associatedComments: [],
        location: Location.DUMMY,
      }),
    ).toBe('Foo');
    expect(
      prettyPrintTypeParameter({
        name: SourceId('Foo'),
        bound: AstBuilder.IdType('Bar'),
        associatedComments: [],
        location: Location.DUMMY,
      }),
    ).toBe('Foo: Bar');
  });

  it('type reposition test', () => {
    expect(
      typeReposition(
        SourceIntType(
          SourceReason(
            new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4)),
            new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4)),
          ),
        ),
        new Location(ModuleReference.DUMMY, Position(5, 6), Position(7, 8)),
      ).reason.useLocation.toString(),
    ).toBe('__DUMMY__.sam:6:7-8:9');
  });

  it('type equality test', () => {
    expect(
      isTheSameType(SourceUnknownType(DummySourceReason), SourceUnknownType(DummySourceReason)),
    ).toBeTruthy();
    expect(isTheSameType(AstBuilder.UnitType, AstBuilder.UnitType)).toBeTruthy();
    expect(isTheSameType(AstBuilder.UnitType, AstBuilder.BoolType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.UnitType, AstBuilder.IntType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.UnitType, AstBuilder.StringType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.BoolType, AstBuilder.UnitType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.BoolType, AstBuilder.BoolType)).toBeTruthy();
    expect(isTheSameType(AstBuilder.BoolType, AstBuilder.IntType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.BoolType, AstBuilder.StringType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.IntType, AstBuilder.UnitType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.IntType, AstBuilder.BoolType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.IntType, AstBuilder.IntType)).toBeTruthy();
    expect(isTheSameType(AstBuilder.IntType, AstBuilder.StringType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.StringType, AstBuilder.UnitType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.StringType, AstBuilder.BoolType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.StringType, AstBuilder.IntType)).toBeFalsy();
    expect(isTheSameType(AstBuilder.StringType, AstBuilder.StringType)).toBeTruthy();

    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
        AstBuilder.UnitType,
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
        AstBuilder.IdType('B'),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
        AstBuilder.IdType('A'),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
        AstBuilder.IdType('A', [AstBuilder.IntType]),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.BoolType, AstBuilder.IntType]),
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
        SourceIdentifierType(DummySourceReason, ModuleReference(['AAA']), 'A', [
          AstBuilder.IntType,
          AstBuilder.BoolType,
        ]),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.BoolType]),
      ),
    ).toBeTruthy();

    expect(
      isTheSameType(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        AstBuilder.UnitType,
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        AstBuilder.FunType([AstBuilder.BoolType], AstBuilder.IntType),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        AstBuilder.FunType([AstBuilder.BoolType], AstBuilder.BoolType),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        AstBuilder.FunType([], AstBuilder.BoolType),
      ),
    ).toBeFalsy();
    expect(
      isTheSameType(
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
        AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
      ),
    ).toBeTruthy();
  });
});
