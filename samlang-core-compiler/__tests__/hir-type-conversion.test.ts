import {
  ModuleReference,
  Range,
  boolType,
  functionType,
  identifierType,
  intType,
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
  collectUsedGenericTypes,
  highIRTypeApplication,
  HighIRTypeSynthesizer,
  SamlangTypeLoweringManager,
} from '../hir-type-conversion';

describe('hir-type-conversion', () => {
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
    expect(Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('A', []), genericTypes))).toEqual(
      ['A']
    );
    expect(Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('B', []), genericTypes))).toEqual(
      ['B']
    );
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

  it('highIRTypeApplication works', () => {
    expect(highIRTypeApplication(HIR_BOOL_TYPE, {})).toEqual(HIR_BOOL_TYPE);
    expect(highIRTypeApplication(HIR_INT_TYPE, {})).toEqual(HIR_INT_TYPE);
    expect(highIRTypeApplication(HIR_STRING_TYPE, {})).toEqual(HIR_STRING_TYPE);

    expect(
      highIRTypeApplication(HIR_IDENTIFIER_TYPE('A', [HIR_INT_TYPE]), { A: HIR_INT_TYPE })
    ).toEqual(HIR_IDENTIFIER_TYPE('A', [HIR_INT_TYPE]));
    expect(highIRTypeApplication(HIR_IDENTIFIER_TYPE('A', []), { B: HIR_INT_TYPE })).toEqual(
      HIR_IDENTIFIER_TYPE('A', [])
    );
    expect(highIRTypeApplication(HIR_IDENTIFIER_TYPE('A', []), { A: HIR_INT_TYPE })).toEqual(
      HIR_INT_TYPE
    );

    expect(
      highIRTypeApplication(
        HIR_FUNCTION_TYPE([HIR_IDENTIFIER_TYPE('A', [])], HIR_IDENTIFIER_TYPE('B', [])),
        { A: HIR_INT_TYPE, B: HIR_BOOL_TYPE }
      )
    ).toEqual(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE));
  });

  it('SamlangTypeLoweringManager.lowerSamlangType() works', () => {
    const typeSynthesizer = new HighIRTypeSynthesizer();
    const manager = new SamlangTypeLoweringManager(new Set(), typeSynthesizer);

    expect(manager.lowerSamlangType(boolType, false)).toEqual(HIR_BOOL_TYPE);
    expect(manager.lowerSamlangType(intType, false)).toEqual(HIR_INT_TYPE);
    expect(manager.lowerSamlangType(unitType, false)).toEqual(HIR_INT_TYPE);
    expect(manager.lowerSamlangType(stringType, false)).toEqual(HIR_STRING_TYPE);

    expect(
      prettyPrintHighIRType(
        manager.lowerSamlangType(identifierType(ModuleReference.DUMMY, 'A', [intType]), false)
      )
    ).toBe('__DUMMY___A<int>');

    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          tupleType([intType, boolType]),
          false
        )
      )
    ).toBe('_SYNTHETIC_ID_TYPE_0');
    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          tupleType([intType, identifierType(ModuleReference.DUMMY, 'T')]),
          false
        )
      )
    ).toBe('_SYNTHETIC_ID_TYPE_1<T>');

    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          functionType([identifierType(ModuleReference.DUMMY, 'T'), boolType], intType),
          false
        )
      )
    ).toBe('_SYNTHETIC_ID_TYPE_2<T>');
    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          functionType([identifierType(ModuleReference.DUMMY, 'T'), boolType], intType),
          true
        )
      )
    ).toBe('_SYNTHETIC_ID_TYPE_3<T, _TypeContext0>');

    expect(() => manager.lowerSamlangType({ type: 'UndecidedType', index: 0 }, false)).toThrow();

    expect(typeSynthesizer.synthesized.map(prettyPrintHighIRTypeDefinition)).toEqual([
      'object type _SYNTHETIC_ID_TYPE_0 = [int, bool]',
      'object type _SYNTHETIC_ID_TYPE_1<T> = [int, T]',
      'object type _SYNTHETIC_ID_TYPE_2<T> = [(int, T, bool) -> int, int]',
      'object type _SYNTHETIC_ID_TYPE_3<T, _TypeContext0> = [(_TypeContext0, T, bool) -> int, _TypeContext0]',
    ]);
  });

  it('SamlangTypeLoweringManager.lowerSamlangTypeDefinition() works', () => {
    const typeSynthesizer = new HighIRTypeSynthesizer();

    expect(
      prettyPrintHighIRTypeDefinition(
        SamlangTypeLoweringManager.lowerSamlangTypeDefinition(
          new Set(['A']),
          typeSynthesizer,
          'Foo',
          {
            range: Range.DUMMY,
            type: 'object',
            names: ['a', 'b'],
            mappings: {
              a: {
                type: functionType(
                  [functionType([identifierType(ModuleReference.ROOT, 'A')], boolType)],
                  boolType
                ),
                isPublic: true,
              },
              b: {
                type: functionType(
                  [functionType([identifierType(ModuleReference.ROOT, 'A')], boolType)],
                  boolType
                ),
                isPublic: false,
              },
            },
          }
        )
      )
    ).toBe(
      'object type Foo<A, _TypeContext1, _TypeContext3> = ' +
        '[_SYNTHETIC_ID_TYPE_1<A, _TypeContext1>, _SYNTHETIC_ID_TYPE_3<A, _TypeContext3>]'
    );
    expect(typeSynthesizer.synthesized.map(prettyPrintHighIRTypeDefinition)).toEqual([
      'object type _SYNTHETIC_ID_TYPE_0<A, _TypeContext0> = ' +
        '[(_TypeContext0, A) -> bool, _TypeContext0]',
      'object type _SYNTHETIC_ID_TYPE_1<A, _TypeContext1> = ' +
        '[(_TypeContext1, _SYNTHETIC_ID_TYPE_0<A, _TypeContext0>) -> bool, _TypeContext1]',
      'object type _SYNTHETIC_ID_TYPE_2<A, _TypeContext2> = ' +
        '[(_TypeContext2, A) -> bool, _TypeContext2]',
      'object type _SYNTHETIC_ID_TYPE_3<A, _TypeContext3> = ' +
        '[(_TypeContext3, _SYNTHETIC_ID_TYPE_2<A, _TypeContext2>) -> bool, _TypeContext3]',
    ]);
  });

  it('SamlangTypeLoweringManager.lowerSamlangFunctionTypeForTopLevel() works', () => {
    expect(
      SamlangTypeLoweringManager.lowerSamlangFunctionTypeForTopLevel(
        new Set(),
        new HighIRTypeSynthesizer(),
        functionType([intType], boolType)
      )
    ).toEqual([[], HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)]);

    expect(
      SamlangTypeLoweringManager.lowerSamlangFunctionTypeForTopLevel(
        new Set(),
        new HighIRTypeSynthesizer(),
        functionType([functionType([intType], boolType)], boolType)
      )
    ).toEqual([
      ['_TypeContext0'],
      HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('_SYNTHETIC_ID_TYPE_0', [HIR_IDENTIFIER_TYPE('_TypeContext0', [])])],
        HIR_BOOL_TYPE
      ),
    ]);
  });
});
