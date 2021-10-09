import {
  UndecidedTypes,
  unitType,
  boolType,
  identifierType,
  tupleType,
  functionType,
  ModuleReference,
} from '../../ast/common-nodes';
import { undecideTypeParameters, undecideFieldTypeParameters } from '../type-undecider';

describe('type-undecider', () => {
  it('will throw on undecided type', () => {
    expect(() => undecideTypeParameters(UndecidedTypes.next(), [])).toThrow();
    expect(() =>
      undecideTypeParameters(
        identifierType(ModuleReference.DUMMY, 'A', [UndecidedTypes.next()]),
        []
      )
    ).toThrow();
  });

  it('can undecide big nested type', () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideTypeParameters(
        functionType(
          [
            identifierType(ModuleReference.DUMMY, 'A', [
              boolType,
              identifierType(ModuleReference.DUMMY, 'T1'),
            ]),
            unitType,
            unitType,
            tupleType([identifierType(ModuleReference.DUMMY, 'T2')]),
          ],
          tupleType([
            identifierType(ModuleReference.DUMMY, 'T3'),
            identifierType(ModuleReference.DUMMY, 'T4'),
          ])
        ),
        ['T1', 'T2', 'T3', 'T4']
      )[0]
    ).toEqual(
      functionType(
        [
          identifierType(ModuleReference.DUMMY, 'A', [
            boolType,
            { type: 'UndecidedType', index: 0 },
          ]),
          unitType,
          unitType,
          tupleType([{ type: 'UndecidedType', index: 1 }]),
        ],
        tupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 3 },
        ])
      )
    );
  });

  it("will avoid undeciding identifier that should't be undecided", () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideTypeParameters(identifierType(ModuleReference.DUMMY, 'A', [boolType]), ['A'])[0]
    ).toEqual(identifierType(ModuleReference.DUMMY, 'A', [boolType]));

    expect(undecideTypeParameters(identifierType(ModuleReference.DUMMY, 'A', []), [])[0]).toEqual(
      identifierType(ModuleReference.DUMMY, 'A', [])
    );

    expect(
      undecideTypeParameters(identifierType(ModuleReference.DUMMY, 'A', [boolType]), ['B'])[0]
    ).toEqual(identifierType(ModuleReference.DUMMY, 'A', [boolType]));
  });

  it('can undecide field types', () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideFieldTypeParameters(
        {
          a: { isPublic: true, type: identifierType(ModuleReference.DUMMY, 'A') },
          b: { isPublic: false, type: identifierType(ModuleReference.DUMMY, 'B') },
        },
        ['A', 'B']
      )[0]
    ).toEqual({
      a: { isPublic: true, type: { type: 'UndecidedType', index: 0 } },
      b: { isPublic: false, type: { type: 'UndecidedType', index: 1 } },
    });
  });
});
