import replaceTypeIdentifier from '../type-identifier-replacer';

import {
  intType,
  identifierType,
  tupleType,
  functionType,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';

it('can replace deeply nested identifiers', () => {
  expect(
    replaceTypeIdentifier(
      functionType(
        [
          identifierType(ModuleReference.DUMMY, 'A', [
            identifierType(ModuleReference.DUMMY, 'B'),
            identifierType(ModuleReference.DUMMY, 'C', [intType]),
          ]),
          tupleType([
            identifierType(ModuleReference.DUMMY, 'D'),
            identifierType(ModuleReference.DUMMY, 'E', [
              identifierType(ModuleReference.DUMMY, 'F'),
            ]),
          ]),
          { type: 'UndecidedType', index: 0 },
        ],
        intType
      ),
      { A: intType, B: intType, C: intType, D: intType, E: intType }
    )
  ).toEqual(
    functionType(
      [
        identifierType(ModuleReference.DUMMY, 'A', [
          intType,
          identifierType(ModuleReference.DUMMY, 'C', [intType]),
        ]),
        tupleType([
          intType,
          identifierType(ModuleReference.DUMMY, 'E', [identifierType(ModuleReference.DUMMY, 'F')]),
        ]),
        { type: 'UndecidedType', index: 0 },
      ],
      intType
    )
  );
});
