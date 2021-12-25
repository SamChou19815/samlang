import { ModuleReference } from '../../ast/common-nodes';
import {
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceTupleType,
  SourceUnitType,
  UndecidedTypes,
} from '../../ast/samlang-nodes';
import { undecideFieldTypeParameters, undecideTypeParameters } from '../type-undecider';

describe('type-undecider', () => {
  it('will throw on undecided type', () => {
    expect(() => undecideTypeParameters(UndecidedTypes.next(), [])).toThrow();
    expect(() =>
      undecideTypeParameters(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [UndecidedTypes.next()]),
        []
      )
    ).toThrow();
  });

  it('can undecide big nested type', () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideTypeParameters(
        SourceFunctionType(
          [
            SourceIdentifierType(ModuleReference.DUMMY, 'A', [
              SourceBoolType,
              SourceIdentifierType(ModuleReference.DUMMY, 'T1'),
            ]),
            SourceUnitType,
            SourceUnitType,
            SourceTupleType([SourceIdentifierType(ModuleReference.DUMMY, 'T2')]),
          ],
          SourceTupleType([
            SourceIdentifierType(ModuleReference.DUMMY, 'T3'),
            SourceIdentifierType(ModuleReference.DUMMY, 'T4'),
          ])
        ),
        ['T1', 'T2', 'T3', 'T4']
      )[0]
    ).toEqual(
      SourceFunctionType(
        [
          SourceIdentifierType(ModuleReference.DUMMY, 'A', [
            SourceBoolType,
            { type: 'UndecidedType', index: 0 },
          ]),
          SourceUnitType,
          SourceUnitType,
          SourceTupleType([{ type: 'UndecidedType', index: 1 }]),
        ],
        SourceTupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 3 },
        ])
      )
    );
  });

  it("will avoid undeciding identifier that should't be undecided", () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideTypeParameters(SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceBoolType]), [
        'A',
      ])[0]
    ).toEqual(SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceBoolType]));

    expect(
      undecideTypeParameters(SourceIdentifierType(ModuleReference.DUMMY, 'A', []), [])[0]
    ).toEqual(SourceIdentifierType(ModuleReference.DUMMY, 'A', []));

    expect(
      undecideTypeParameters(SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceBoolType]), [
        'B',
      ])[0]
    ).toEqual(SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceBoolType]));
  });

  it('can undecide field types', () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideFieldTypeParameters(
        {
          a: { isPublic: true, type: SourceIdentifierType(ModuleReference.DUMMY, 'A') },
          b: { isPublic: false, type: SourceIdentifierType(ModuleReference.DUMMY, 'B') },
        },
        ['A', 'B']
      )[0]
    ).toEqual({
      a: { isPublic: true, type: { type: 'UndecidedType', index: 0 } },
      b: { isPublic: false, type: { type: 'UndecidedType', index: 1 } },
    });
  });
});
