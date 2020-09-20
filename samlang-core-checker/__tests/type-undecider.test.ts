import { undecideTypeParameters, undecideFieldTypeParameters } from '../type-undecider';

import {
  UndecidedTypes,
  unitType,
  boolType,
  identifierType,
  tupleType,
  functionType,
} from 'samlang-core-ast/common-nodes';

it('will throw on undecided type', () => {
  expect(() => undecideTypeParameters(UndecidedTypes.next(), [])).toThrow();
  expect(() => undecideTypeParameters(identifierType('A', [UndecidedTypes.next()]), [])).toThrow();
});

it('can undecide big nested type', () => {
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

  expect(
    undecideTypeParameters(
      functionType(
        [
          identifierType('A', [boolType, identifierType('T1')]),
          unitType,
          unitType,
          tupleType([identifierType('T2')]),
        ],
        tupleType([identifierType('T3'), identifierType('T4')])
      ),
      ['T1', 'T2', 'T3', 'T4']
    )[0]
  ).toEqual(
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
  );
});

it("will avoid undeciding identifier that should't be undecided", () => {
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

  expect(undecideTypeParameters(identifierType('A', [boolType]), ['A'])[0]).toEqual(
    identifierType('A', [boolType])
  );

  expect(undecideTypeParameters(identifierType('A', []), [])[0]).toEqual(identifierType('A', []));

  expect(undecideTypeParameters(identifierType('A', [boolType]), ['B'])[0]).toEqual(
    identifierType('A', [boolType])
  );
});

it('can undecide field types', () => {
  UndecidedTypes.resetUndecidedTypeIndex_ONLY_FOR_TEST();

  expect(
    undecideFieldTypeParameters(
      {
        a: { isPublic: true, type: identifierType('A') },
        b: { isPublic: false, type: identifierType('B') },
      },
      ['A', 'B']
    )[0]
  ).toEqual({
    a: { isPublic: true, type: { type: 'UndecidedType', index: 0 } },
    b: { isPublic: false, type: { type: 'UndecidedType', index: 1 } },
  });
});
