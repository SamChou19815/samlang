import { undecideTypeParameters, undecideFieldTypeParameters } from '../type-undecider';

import {
  UndecidedTypes,
  unitType,
  boolType,
  identifierType,
  tupleType,
  functionType,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';

it('will throw on undecided type', () => {
  expect(() => undecideTypeParameters(UndecidedTypes.next(), [])).toThrow();
  expect(() =>
    undecideTypeParameters(identifierType(ModuleReference.ROOT, 'A', [UndecidedTypes.next()]), [])
  ).toThrow();
});

it('can undecide big nested type', () => {
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

  expect(
    undecideTypeParameters(
      functionType(
        [
          identifierType(ModuleReference.ROOT, 'A', [
            boolType,
            identifierType(ModuleReference.ROOT, 'T1'),
          ]),
          unitType,
          unitType,
          tupleType([identifierType(ModuleReference.ROOT, 'T2')]),
        ],
        tupleType([
          identifierType(ModuleReference.ROOT, 'T3'),
          identifierType(ModuleReference.ROOT, 'T4'),
        ])
      ),
      ['T1', 'T2', 'T3', 'T4']
    )[0]
  ).toEqual(
    functionType(
      [
        identifierType(ModuleReference.ROOT, 'A', [boolType, { type: 'UndecidedType', index: 0 }]),
        unitType,
        unitType,
        tupleType([{ type: 'UndecidedType', index: 1 }]),
      ],
      tupleType([
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 3 },
      ])
    )
  );
});

it("will avoid undeciding identifier that should't be undecided", () => {
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

  expect(
    undecideTypeParameters(identifierType(ModuleReference.ROOT, 'A', [boolType]), ['A'])[0]
  ).toEqual(identifierType(ModuleReference.ROOT, 'A', [boolType]));

  expect(undecideTypeParameters(identifierType(ModuleReference.ROOT, 'A', []), [])[0]).toEqual(
    identifierType(ModuleReference.ROOT, 'A', [])
  );

  expect(
    undecideTypeParameters(identifierType(ModuleReference.ROOT, 'A', [boolType]), ['B'])[0]
  ).toEqual(identifierType(ModuleReference.ROOT, 'A', [boolType]));
});

it('can undecide field types', () => {
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

  expect(
    undecideFieldTypeParameters(
      {
        a: { isPublic: true, type: identifierType(ModuleReference.ROOT, 'A') },
        b: { isPublic: false, type: identifierType(ModuleReference.ROOT, 'B') },
      },
      ['A', 'B']
    )[0]
  ).toEqual({
    a: { isPublic: true, type: { type: 'UndecidedType', index: 0 } },
    b: { isPublic: false, type: { type: 'UndecidedType', index: 1 } },
  });
});
