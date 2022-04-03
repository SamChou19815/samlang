import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import collectUndecidedTypeIndices from '../undecided-type-collector';

describe('undecided-type-collector', () => {
  it('can collect all undecided types', () => {
    expect(
      Array.from(
        collectUndecidedTypeIndices(
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
        ).values()
      )
    ).toEqual([0, 1, 2, 3]);
  });
});
