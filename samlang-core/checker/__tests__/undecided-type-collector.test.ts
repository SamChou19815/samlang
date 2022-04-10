import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
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
            ],
            SourceUnitType(DummySourceReason)
          )
        ).values()
      )
    ).toEqual([0]);
  });
});
