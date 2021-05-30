import { HighIRTypeSynthesizer, lowerSamlangType } from '../hir-type-conversion';

import {
  boolType,
  functionType,
  identifierType,
  intType,
  ModuleReference,
  stringType,
  tupleType,
  unitType,
} from 'samlang-core-ast/common-nodes';
import {
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_FUNCTION_TYPE,
} from 'samlang-core-ast/hir-nodes';

it('HighIRTypeSynthesizer works', () => {
  const synthesizer = new HighIRTypeSynthesizer();

  expect(
    synthesizer.synthesizeTupleType(
      [HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)],
      []
    ).identifier
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    synthesizer.synthesizeTupleType(
      [HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_BOOL_TYPE)],
      []
    ).identifier
  ).toBe('_SYNTHETIC_ID_TYPE_1');

  expect(
    synthesizer.synthesizeTupleType(
      [HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)],
      []
    ).identifier
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    synthesizer.synthesizeTupleType(
      [HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_BOOL_TYPE)],
      []
    ).identifier
  ).toBe('_SYNTHETIC_ID_TYPE_1');

  expect(synthesizer.synthesized).toEqual([
    {
      type: 'object',
      identifier: '_SYNTHETIC_ID_TYPE_0',
      typeParameters: [],
      mappings: [HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)],
    },
    {
      type: 'object',
      identifier: '_SYNTHETIC_ID_TYPE_1',
      typeParameters: [],
      mappings: [HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_BOOL_TYPE)],
    },
  ]);
  expect(Array.from(synthesizer.mappings.keys())).toEqual([
    '_SYNTHETIC_ID_TYPE_0',
    '_SYNTHETIC_ID_TYPE_1',
  ]);
});

it('lowerSamlangType works', () => {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  expect(lowerSamlangType(boolType, new Set(), typeSynthesizer)).toEqual(HIR_BOOL_TYPE);
  expect(lowerSamlangType(intType, new Set(), typeSynthesizer)).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(unitType, new Set(), typeSynthesizer)).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(stringType, new Set([]), typeSynthesizer)).toEqual(HIR_STRING_TYPE);

  expect(
    lowerSamlangType(
      identifierType(ModuleReference.DUMMY, 'A', [intType]),
      new Set(),
      typeSynthesizer
    )
  ).toEqual(HIR_IDENTIFIER_TYPE('__DUMMY___A', [HIR_INT_TYPE]));

  expect(lowerSamlangType(tupleType([intType, boolType]), new Set('T'), typeSynthesizer)).toEqual(
    HIR_IDENTIFIER_TYPE('_SYNTHETIC_ID_TYPE_0', [HIR_IDENTIFIER_TYPE('T', [])])
  );

  expect(
    lowerSamlangType(
      functionType([identifierType(ModuleReference.DUMMY, 'T'), boolType], intType),
      new Set('T'),
      typeSynthesizer
    )
  ).toEqual(
    HIR_IDENTIFIER_TYPE('_SYNTHETIC_ID_TYPE_1', [
      HIR_IDENTIFIER_TYPE('T', []),
      HIR_IDENTIFIER_TYPE('_Context', []),
    ])
  );

  expect(() =>
    lowerSamlangType({ type: 'UndecidedType', index: 0 }, new Set(), typeSynthesizer)
  ).toThrow();

  expect(typeSynthesizer.synthesized).toEqual([
    {
      identifier: '_SYNTHETIC_ID_TYPE_0',
      type: 'object',
      typeParameters: ['T'],
      mappings: [HIR_INT_TYPE, HIR_BOOL_TYPE],
    },
    {
      identifier: '_SYNTHETIC_ID_TYPE_1',
      type: 'object',
      typeParameters: ['T', '_Context'],
      mappings: [
        HIR_FUNCTION_TYPE(
          [
            HIR_IDENTIFIER_TYPE('_Context', []),
            HIR_IDENTIFIER_TYPE('__DUMMY___T', []),
            HIR_BOOL_TYPE,
          ],
          HIR_INT_TYPE
        ),
        HIR_IDENTIFIER_TYPE('_Context', []),
      ],
    },
  ]);
});
