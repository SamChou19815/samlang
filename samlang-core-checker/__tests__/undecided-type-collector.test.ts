import {
  unitType,
  boolType,
  tupleType,
  identifierType,
  functionType,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';

import collectUndecidedTypeIndices from '../undecided-type-collector';

describe('undecided-type-collector', () => {
  it('can collect all undecided types', () => {
    expect(
      Array.from(
        collectUndecidedTypeIndices(
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
        ).values()
      )
    ).toEqual([0, 1, 2, 3]);
  });
});
