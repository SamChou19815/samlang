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
  HIR_STRUCT_TYPE,
  HIR_CLOSURE_TYPE,
} from 'samlang-core-ast/hir-types';

it('lowerSamlangType works', () => {
  expect(lowerSamlangType(boolType, new Set())).toEqual(HIR_BOOL_TYPE);
  expect(lowerSamlangType(intType, new Set())).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(unitType, new Set())).toEqual(HIR_INT_TYPE);
  expect(lowerSamlangType(stringType, new Set([]))).toEqual(HIR_STRING_TYPE);

  expect(lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A'), new Set())).toEqual(
    HIR_IDENTIFIER_TYPE('__DUMMY___A')
  );
  expect(lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A'), new Set(['A']))).toEqual(
    HIR_ANY_TYPE
  );

  expect(lowerSamlangType(tupleType([intType, boolType]), new Set())).toEqual(
    HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_BOOL_TYPE])
  );
  expect(lowerSamlangType(functionType([intType, boolType], intType), new Set())).toEqual(
    HIR_CLOSURE_TYPE
  );

  expect(() => lowerSamlangType({ type: 'UndecidedType', index: 0 }, new Set())).toThrow();
});
