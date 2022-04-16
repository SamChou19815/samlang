import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import { SourceFunctionType, SourceIdentifierType, SourceIntType } from '../../ast/samlang-nodes';
import performTypeSubstitution from '../type-substitution';

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
          SourceIntType(DummySourceReason)
        ),
        {
          A: SourceIntType(DummySourceReason),
          B: SourceIntType(DummySourceReason),
          C: SourceIntType(DummySourceReason),
          D: SourceIntType(DummySourceReason),
          E: SourceIntType(DummySourceReason),
        }
      )
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
        SourceIntType(DummySourceReason)
      )
    );
  });
});
