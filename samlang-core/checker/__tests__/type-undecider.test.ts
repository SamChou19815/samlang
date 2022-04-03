import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
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
  it('can undecide big nested type', () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideTypeParameters(
        SourceFunctionType(
          DummySourceReason,
          [
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
              SourceBoolType(DummySourceReason),
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'T1'),
            ]),
            SourceUnitType(DummySourceReason),
            SourceUnitType(DummySourceReason),
            SourceTupleType(DummySourceReason, [
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'T2'),
            ]),
          ],
          SourceTupleType(DummySourceReason, [
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'T3'),
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'T4'),
          ])
        ),
        ['T1', 'T2', 'T3', 'T4']
      )[0]
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
            SourceBoolType(DummySourceReason),
            { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
          ]),
          SourceUnitType(DummySourceReason),
          SourceUnitType(DummySourceReason),
          SourceTupleType(DummySourceReason, [
            { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
          ]),
        ],
        SourceTupleType(DummySourceReason, [
          { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
          { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        ])
      )
    );
  });

  it("will avoid undeciding identifier that should't be undecided", () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideTypeParameters(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceBoolType(DummySourceReason),
        ]),
        ['A']
      )[0]
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceBoolType(DummySourceReason),
      ])
    );

    expect(
      undecideTypeParameters(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', []),
        []
      )[0]
    ).toEqual(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', []));

    expect(
      undecideTypeParameters(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceBoolType(DummySourceReason),
        ]),
        ['B']
      )[0]
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceBoolType(DummySourceReason),
      ])
    );
  });

  it('can undecide field types', () => {
    UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

    expect(
      undecideFieldTypeParameters(
        {
          a: {
            isPublic: true,
            type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
          },
          b: {
            isPublic: false,
            type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
          },
        },
        ['A', 'B']
      )[0]
    ).toEqual({
      a: { isPublic: true, type: { type: 'UndecidedType', reason: DummySourceReason, index: 0 } },
      b: { isPublic: false, type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 } },
    });
  });
});
