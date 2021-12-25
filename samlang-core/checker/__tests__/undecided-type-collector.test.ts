import { ModuleReference } from '../../ast/common-nodes';
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
        ).values()
      )
    ).toEqual([0, 1, 2, 3]);
  });
});
