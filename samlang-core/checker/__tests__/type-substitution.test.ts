import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceTupleType,
} from '../../ast/samlang-nodes';
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
            SourceTupleType(DummySourceReason, [
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'D'),
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'E', [
                SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'F'),
              ]),
            ]),
            { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
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
          SourceTupleType(DummySourceReason, [
            SourceIntType(DummySourceReason),
            SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'E', [
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'F'),
            ]),
          ]),
          { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        ],
        SourceIntType(DummySourceReason)
      )
    );
  });
});
