import {
  unitType,
  boolType,
  tupleType,
  identifierType,
  functionType,
} from '../../ast/common/types';
import collectUndecidedTypeIndices from '../undecided-type-collector';

it('can collect all undecided types', () => {
  expect(
    Array.from(
      collectUndecidedTypeIndices(
        functionType(
          [
            identifierType('A', [boolType, { type: 'UndecidedType', index: 0 }]),
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
