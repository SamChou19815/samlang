import { intType, identifierType, tupleType, functionType } from '../../ast/common/types';
import replaceTypeIdentifier from '../type-identifier-replacer';

it('can replace deeply nested identifiers', () => {
  expect(
    replaceTypeIdentifier(
      functionType(
        [
          identifierType('A', [identifierType('B'), identifierType('C', [intType])]),
          tupleType([identifierType('D'), identifierType('E', [identifierType('F')])]),
          { type: 'UndecidedType', index: 0 },
        ],
        intType
      ),
      { A: intType, B: intType, C: intType, D: intType, E: intType }
    )
  ).toEqual(
    functionType(
      [
        identifierType('A', [intType, identifierType('C', [intType])]),
        tupleType([intType, identifierType('E', [identifierType('F')])]),
        { type: 'UndecidedType', index: 0 },
      ],
      intType
    )
  );
});
