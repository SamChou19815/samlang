import { DummySourceReason } from '../../ast/common-nodes';
import {
  SamlangType,
  SourceBoolType,
  SourceFunctionType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import { assert } from '../../utils';
import TypeResolution from '../type-resolution';

describe('type-resolution', () => {
  it('can resolve basic disjoint types with sufficient information', () => {
    const resolution = new TypeResolution();
    expect(resolution.addTypeResolution(0, SourceIntType(DummySourceReason))).toEqual(
      SourceIntType(DummySourceReason)
    );
    expect(resolution.addTypeResolution(1, SourceBoolType(DummySourceReason))).toEqual(
      SourceBoolType(DummySourceReason)
    );
    expect(resolution.addTypeResolution(2, SourceStringType(DummySourceReason))).toEqual(
      SourceStringType(DummySourceReason)
    );
    expect(resolution.addTypeResolution(2, SourceStringType(DummySourceReason))).toEqual(
      SourceStringType(DummySourceReason)
    );
    expect(resolution.addTypeResolution(3, SourceUnitType(DummySourceReason))).toEqual(
      SourceUnitType(DummySourceReason)
    );

    // Basic single element resolution.
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 0 })
    ).toEqual(SourceIntType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 1 })
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 2 })
    ).toEqual(SourceStringType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 3 })
    ).toEqual(SourceUnitType(DummySourceReason));
    // Recursive resolution.
    expect(
      resolution.resolveType(
        SourceFunctionType(
          DummySourceReason,
          [
            { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
            { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
            { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
            SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
          ],
          SourceFunctionType(DummySourceReason, [], {
            type: 'UndecidedType',
            reason: DummySourceReason,
            index: 3,
          })
        )
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
          SourceStringType(DummySourceReason),
          SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
        ],
        SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason))
      )
    );
  });

  it('can link together diffSamlangTypet typeSamlangType', () => {
    const resolution = new TypeResolution();
    expect(resolution.addTypeResolution(0, SourceIntType(DummySourceReason))).toEqual(
      SourceIntType(DummySourceReason)
    );

    function simpleMeet(t1: SamlangType, t2: SamlangType) {
      assert(t1 === t2, 'Inconsistency detected');
      return t1;
    }

    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        simpleMeet
      )
    ).toEqual(SourceIntType(DummySourceReason));

    expect(resolution.addTypeResolution(2, SourceBoolType(DummySourceReason))).toEqual(
      SourceBoolType(DummySourceReason)
    );
    expect(() =>
      resolution.establishAliasing(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        simpleMeet
      )
    ).toThrow();

    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 0 })
    ).toEqual(SourceIntType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 1 })
    ).toEqual(SourceIntType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 2 })
    ).toEqual(SourceBoolType(DummySourceReason));

    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 4 },
        simpleMeet
      )
    ).toEqual({ type: 'UndecidedType', reason: DummySourceReason, index: 3 });
    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        simpleMeet
      )
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 2 })
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 3 })
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      resolution.resolveType({ type: 'UndecidedType', reason: DummySourceReason, index: 4 })
    ).toEqual(SourceBoolType(DummySourceReason));
  });
});
