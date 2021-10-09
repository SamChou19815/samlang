import {
  unitType,
  boolType,
  intType,
  stringType,
  tupleType,
  functionType,
  Type,
} from '../../ast/common-nodes';
import { assert } from '../../utils';
import TypeResolution from '../type-resolution';

describe('type-resolution', () => {
  it('can resolve basic disjoint types with sufficient information', () => {
    const resolution = new TypeResolution();
    expect(resolution.addTypeResolution(0, intType)).toEqual(intType);
    expect(resolution.addTypeResolution(1, boolType)).toEqual(boolType);
    expect(resolution.addTypeResolution(2, stringType)).toEqual(stringType);
    expect(resolution.addTypeResolution(2, stringType)).toEqual(stringType);
    expect(resolution.addTypeResolution(3, unitType)).toEqual(unitType);

    // Basic single element resolution.
    expect(resolution.resolveType({ type: 'UndecidedType', index: 0 })).toEqual(intType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 1 })).toEqual(boolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 2 })).toEqual(stringType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 3 })).toEqual(unitType);
    // Recursive resolution.
    expect(
      resolution.resolveType(
        functionType(
          [
            tupleType([
              { type: 'UndecidedType', index: 0 },
              { type: 'UndecidedType', index: 1 },
            ]),
            { type: 'UndecidedType', index: 2 },
            functionType([], unitType),
          ],
          functionType([], { type: 'UndecidedType', index: 3 })
        )
      )
    ).toEqual(
      functionType(
        [tupleType([intType, boolType]), stringType, functionType([], unitType)],
        functionType([], unitType)
      )
    );
  });

  it('can link together different type set', () => {
    const resolution = new TypeResolution();
    expect(resolution.addTypeResolution(0, intType)).toEqual(intType);

    function simpleMeet(t1: Type, t2: Type) {
      assert(t1 === t2, 'Inconsistency detected');
      return t1;
    }

    expect(
      resolution.establishAliasing(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 1 },
        simpleMeet
      )
    ).toEqual(intType);

    expect(resolution.addTypeResolution(2, boolType)).toEqual(boolType);
    expect(() =>
      resolution.establishAliasing(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 2 },
        simpleMeet
      )
    ).toThrow();

    expect(resolution.resolveType({ type: 'UndecidedType', index: 0 })).toEqual(intType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 1 })).toEqual(intType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 2 })).toEqual(boolType);

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
    ).toEqual(boolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 2 })).toEqual(boolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 3 })).toEqual(boolType);
    expect(resolution.resolveType({ type: 'UndecidedType', index: 4 })).toEqual(boolType);
  });
});
