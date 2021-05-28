import HighIRTypeSynthesizer from '../hir-type-synthesizer';
import lowerSamlangType from '../hir-types-lowering';

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
  HIR_ANY_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_CLOSURE_TYPE,
} from 'samlang-core-ast/hir-types';

it('lowerSamlangType works', () => {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  expect(lowerSamlangType(boolType, new Set(), typeSynthesizer)).toEqual(HIR_BOOL_TYPE);
  expect(lowerSamlangType(intType, new Set(), typeSynthesizer)).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(unitType, new Set(), typeSynthesizer)).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(stringType, new Set([]), typeSynthesizer)).toEqual(HIR_STRING_TYPE);

  expect(
    lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A'), new Set(), typeSynthesizer)
  ).toEqual(HIR_IDENTIFIER_TYPE('__DUMMY___A'));
  expect(
    lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A'), new Set(['A']), typeSynthesizer)
  ).toEqual(HIR_ANY_TYPE);

  expect(lowerSamlangType(tupleType([intType, boolType]), new Set(), typeSynthesizer)).toEqual(
    HIR_IDENTIFIER_TYPE('_SYNTHETIC_ID_TYPE_0')
  );
  expect(typeSynthesizer.synthesized.length).toBe(1);

  expect(
    lowerSamlangType(functionType([intType, boolType], intType), new Set(), typeSynthesizer)
  ).toEqual(HIR_CLOSURE_TYPE);

  expect(() =>
    lowerSamlangType({ type: 'UndecidedType', index: 0 }, new Set(), typeSynthesizer)
  ).toThrow();
});
