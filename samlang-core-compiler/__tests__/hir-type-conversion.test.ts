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
  prettyPrintHighIRType,
  prettyPrintHighIRTypeDefinition,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_FUNCTION_TYPE,
} from 'samlang-core-ast/hir-nodes';

import {
  HighIRTypeSynthesizer,
  collectUsedGenericTypes,
  lowerSamlangType,
  lowerSamlangFunctionTypeForTopLevel,
} from '../hir-type-conversion';

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

  expect(synthesizer.synthesized.map(prettyPrintHighIRTypeDefinition)).toEqual([
    'object type _SYNTHETIC_ID_TYPE_0 = [bool, (int) -> bool]',
    'object type _SYNTHETIC_ID_TYPE_1 = [int, (bool) -> bool]',
  ]);
  expect(Array.from(synthesizer.mappings.keys())).toEqual([
    '_SYNTHETIC_ID_TYPE_0',
    '_SYNTHETIC_ID_TYPE_1',
  ]);
});

it('collectUsedGenericTypes works', () => {
  const genericTypes = new Set(['A', 'B']);
  expect(Array.from(collectUsedGenericTypes(HIR_BOOL_TYPE, genericTypes))).toEqual([]);

  expect(Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('C', []), genericTypes))).toEqual(
    []
  );
  expect(
    Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('A', [HIR_BOOL_TYPE]), genericTypes))
  ).toEqual([]);
  expect(Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('A', []), genericTypes))).toEqual([
    'A',
  ]);
  expect(Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('B', []), genericTypes))).toEqual([
    'B',
  ]);
  expect(
    Array.from(
      collectUsedGenericTypes(
        HIR_IDENTIFIER_TYPE('A', [HIR_IDENTIFIER_TYPE('B', [])]),
        genericTypes
      )
    )
  ).toEqual(['B']);

  expect(
    Array.from(
      collectUsedGenericTypes(
        HIR_FUNCTION_TYPE([HIR_IDENTIFIER_TYPE('A', [])], HIR_IDENTIFIER_TYPE('B', [])),
        genericTypes
      )
    )
  ).toEqual(['A', 'B']);
});

it('lowerSamlangType works', () => {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  expect(lowerSamlangType(boolType, new Set(), typeSynthesizer)).toEqual(HIR_BOOL_TYPE);
  expect(lowerSamlangType(intType, new Set(), typeSynthesizer)).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(unitType, new Set(), typeSynthesizer)).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(stringType, new Set([]), typeSynthesizer)).toEqual(HIR_STRING_TYPE);

  expect(
    prettyPrintHighIRType(
      lowerSamlangType(
        identifierType(ModuleReference.DUMMY, 'A', [intType]),
        new Set(),
        typeSynthesizer
      )
    )
  ).toBe('__DUMMY___A<int>');

  expect(
    prettyPrintHighIRType(
      lowerSamlangType(tupleType([intType, boolType]), new Set('T'), typeSynthesizer)
    )
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    prettyPrintHighIRType(
      lowerSamlangType(
        tupleType([intType, identifierType(ModuleReference.DUMMY, 'T')]),
        new Set('T'),
        typeSynthesizer
      )
    )
  ).toBe('_SYNTHETIC_ID_TYPE_1<T>');

  expect(
    prettyPrintHighIRType(
      lowerSamlangType(
        functionType([identifierType(ModuleReference.DUMMY, 'T'), boolType], intType),
        new Set('T'),
        typeSynthesizer
      )
    )
  ).toBe('_SYNTHETIC_ID_TYPE_2<T, _Context>');

  expect(() =>
    lowerSamlangType({ type: 'UndecidedType', index: 0 }, new Set(), typeSynthesizer)
  ).toThrow();

  expect(typeSynthesizer.synthesized.map(prettyPrintHighIRTypeDefinition)).toEqual([
    'object type _SYNTHETIC_ID_TYPE_0 = [int, bool]',
    'object type _SYNTHETIC_ID_TYPE_1<T> = [int, T]',
    'object type _SYNTHETIC_ID_TYPE_2<T, _Context> = [(_Context, T, bool) -> int, _Context]',
  ]);
});

it('lowerSamlangFunctionTypeForTopLevel works for simple case', () => {
  expect(
    lowerSamlangFunctionTypeForTopLevel(
      functionType([intType], boolType),
      new Set(),
      new HighIRTypeSynthesizer()
    )
  ).toEqual(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE));
});
