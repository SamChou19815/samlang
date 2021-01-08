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
          identifierType(ModuleReference.ROOT, 'A', [
            identifierType(ModuleReference.ROOT, 'B'),
            identifierType(ModuleReference.ROOT, 'C', [intType]),
          ]),
          tupleType([
            identifierType(ModuleReference.ROOT, 'D'),
            identifierType(ModuleReference.ROOT, 'E', [identifierType(ModuleReference.ROOT, 'F')]),
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
        identifierType(ModuleReference.ROOT, 'A', [
          intType,
          identifierType(ModuleReference.ROOT, 'C', [intType]),
        ]),
        tupleType([
          intType,
          identifierType(ModuleReference.ROOT, 'E', [identifierType(ModuleReference.ROOT, 'F')]),
        ]),
        { type: 'UndecidedType', index: 0 },
      ],
      intType
    )
  );
});
