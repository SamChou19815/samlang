import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import { SourceFunctionType, SourceIdentifierType, SourceIntType } from '../../ast/samlang-nodes';
import performTypeSubstitution, { normalizeTypeInformation } from '../type-substitution';

describe('type-substitution', () => {
  it('can replace deeply nested identifiers', () => {
    expect(
      performTypeSubstitution(
        SourceFunctionType(
          DummySourceReason,
          [
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C', [
                SourceIntType(DummySourceReason),
              ]),
            ]),
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'D'),
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'E', [
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'F'),
            ]),
            SourceIntType(DummySourceReason),
          ],
          SourceIntType(DummySourceReason),
        ),
        {
          A: SourceIntType(DummySourceReason),
          B: SourceIntType(DummySourceReason),
          C: SourceIntType(DummySourceReason),
          D: SourceIntType(DummySourceReason),
          E: SourceIntType(DummySourceReason),
        },
      ),
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
            SourceIntType(DummySourceReason),
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C', [
              SourceIntType(DummySourceReason),
            ]),
          ]),
          SourceIntType(DummySourceReason),
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'E', [
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'F'),
          ]),
          SourceIntType(DummySourceReason),
        ],
        SourceIntType(DummySourceReason),
      ),
    );
  });

  it('normalizeTypeInformation works', () => {
    expect(
      normalizeTypeInformation(ModuleReference.DUMMY, {
        isPublic: true,
        typeParameters: [{ name: 'A', bound: null }],
        type: SourceFunctionType(
          DummySourceReason,
          [SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [])],
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', []),
        ),
      }),
    ).toEqual({
      isPublic: true,
      typeParameters: [{ name: '_T0', bound: null }],
      type: SourceFunctionType(
        DummySourceReason,
        [SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, '_T0', [])],
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, '_T0', []),
      ),
    });
  });

  it('normalizeTypeInformation with bounds works', () => {
    expect(
      normalizeTypeInformation(ModuleReference.DUMMY, {
        isPublic: true,
        typeParameters: [{ name: 'A', bound: SourceIntType(DummySourceReason) }],
        type: SourceFunctionType(
          DummySourceReason,
          [SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [])],
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', []),
        ),
      }),
    ).toEqual({
      isPublic: true,
      typeParameters: [{ name: '_T0', bound: SourceIntType(DummySourceReason) }],
      type: SourceFunctionType(
        DummySourceReason,
        [SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, '_T0', [])],
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, '_T0', []),
      ),
    });
  });
});
