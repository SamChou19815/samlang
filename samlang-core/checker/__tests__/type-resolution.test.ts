import {
  SamlangType,
  SourceBoolType,
  SourceFunctionType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import { assert } from '../../utils';
import TypeResolution from '../type-resolution';

describe('type-resolution', () => {
  it('can resolve basic disjoint types with sufficient information', () => {
    const resolution = new TypeResolution();
    expect(resolution.addTypeResolution(0, SourceIntType)).toEqual(SourceIntType);
    expect(resolution.addTypeResolution(1, SourceBoolType)).toEqual(SourceBoolType);
    expect(resolution.addTypeResolution(2, SourceStringType)).toEqual(SourceStringType);
    expect(resolution.addTypeResolution(2, SourceStringType)).toEqual(SourceStringType);
    expect(resolution.addTypeResolution(3, SourceUnitType)).toEqual(SourceUnitType);

    // Basic single element resolution.
    expect(resolution.resolveType({ type: 'UndecidedType', index: 0 })).toEqual(SourceIntType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 1 })).toEqual(SourceBoolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 2 })).toEqual(SourceStringType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 3 })).toEqual(SourceUnitType);
    // Recursive resolution.
    expect(
      resolution.resolveType(
        SourceFunctionType(
          [
            SourceTupleType([
              { type: 'UndecidedType', index: 0 },
              { type: 'UndecidedType', index: 1 },
            ]),
            { type: 'UndecidedType', index: 2 },
            SourceFunctionType([], SourceUnitType),
          ],
          SourceFunctionType([], { type: 'UndecidedType', index: 3 })
        )
      )
    ).toEqual(
      SourceFunctionType(
        [
          SourceTupleType([SourceIntType, SourceBoolType]),
          SourceStringType,
          SourceFunctionType([], SourceUnitType),
        ],
        SourceFunctionType([], SourceUnitType)
      )
    );
  });

  it('can link together diffSamlangTypet typeSamlangType', () => {
    const resolution = new TypeResolution();
    expect(resolution.addTypeResolution(0, SourceIntType)).toEqual(SourceIntType);

    function simpleMeet(t1: SamlangType, t2: SamlangType) {
      assert(t1 === t2, 'Inconsistency detected');
      return t1;
    }

    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 1 },
        simpleMeet
      )
    ).toEqual(SourceIntType);

    expect(resolution.addTypeResolution(2, SourceBoolType)).toEqual(SourceBoolType);
    expect(() =>
      resolution.establishAliasing(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 2 },
        simpleMeet
      )
    ).toThrow();

    expect(resolution.resolveType({ type: 'UndecidedType', index: 0 })).toEqual(SourceIntType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 1 })).toEqual(SourceIntType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 2 })).toEqual(SourceBoolType);

    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', index: 3 },
        { type: 'UndecidedType', index: 4 },
        simpleMeet
      )
    ).toEqual({ type: 'UndecidedType', index: 3 });
    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 3 },
        simpleMeet
      )
    ).toEqual(SourceBoolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 2 })).toEqual(SourceBoolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 3 })).toEqual(SourceBoolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 4 })).toEqual(SourceBoolType);
  });
});
