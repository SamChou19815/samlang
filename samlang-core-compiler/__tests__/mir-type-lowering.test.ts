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
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
  MIR_ANY_TYPE,
  MIR_STRING_TYPE,
  MIR_IDENTIFIER_TYPE,
} from 'samlang-core-ast/mir-nodes';

import MidIRTypeSynthesizer from '../mir-type-synthesizer';
import lowerSamlangType from '../mir-types-lowering';

it('lowerSamlangType works', () => {
  const typeSynthesizer = new MidIRTypeSynthesizer();
  expect(lowerSamlangType(boolType, new Set(), typeSynthesizer)).toEqual(MIR_BOOL_TYPE);
  expect(lowerSamlangType(intType, new Set(), typeSynthesizer)).toEqual(MIR_INT_TYPE);
  expect(lowerSamlangType(unitType, new Set(), typeSynthesizer)).toEqual(MIR_INT_TYPE);
  expect(lowerSamlangType(stringType, new Set([]), typeSynthesizer)).toEqual(MIR_STRING_TYPE);

  expect(
    lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A'), new Set(), typeSynthesizer)
  ).toEqual(MIR_IDENTIFIER_TYPE('__DUMMY___A'));
  expect(
    lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A'), new Set(['A']), typeSynthesizer)
  ).toEqual(MIR_ANY_TYPE);

  expect(lowerSamlangType(tupleType([intType, boolType]), new Set(), typeSynthesizer)).toEqual(
    MIR_IDENTIFIER_TYPE('_SYNTHETIC_ID_TYPE_0')
  );
  expect(typeSynthesizer.synthesized.length).toBe(1);

  expect(
    lowerSamlangType(functionType([intType, boolType], intType), new Set(), typeSynthesizer)
  ).toEqual(MIR_IDENTIFIER_TYPE('_SYNTHETIC_ID_TYPE_1'));
  expect(typeSynthesizer.synthesized.length).toBe(2);

  expect(() =>
    lowerSamlangType({ type: 'UndecidedType', index: 0 }, new Set(), typeSynthesizer)
  ).toThrow();
});
