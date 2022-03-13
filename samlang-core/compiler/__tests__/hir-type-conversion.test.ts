import { ModuleReference, Range } from '../../ast/common-nodes';
import {
  HIR_BOOL_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  prettyPrintHighIRClosureTypeDefinition,
  prettyPrintHighIRType,
  prettyPrintHighIRTypeDefinition,
} from '../../ast/hir-nodes';
import {
  SourceBoolType,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import {
  collectUsedGenericTypes,
  encodeHighIRNameAfterGenericsSpecialization,
  highIRTypeApplication,
  HighIRTypeSynthesizer,
  resolveIdentifierTypeMappings,
  SamlangTypeLoweringManager,
  solveTypeArguments,
} from '../hir-type-conversion';

describe('hir-type-conversion', () => {
  it('HighIRTypeSynthesizer works', () => {
    const synthesizer = new HighIRTypeSynthesizer();

    expect(
      synthesizer.synthesizeTupleType(
        [HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)],
        []
      ).identifier
    ).toBe('$SyntheticIDType0');
    expect(
      synthesizer.synthesizeTupleType(
        [HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_BOOL_TYPE)],
        []
      ).identifier
    ).toBe('$SyntheticIDType1');

    expect(
      synthesizer.synthesizeTupleType(
        [HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)],
        []
      ).identifier
    ).toBe('$SyntheticIDType0');
    expect(
      synthesizer.synthesizeTupleType(
        [HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_BOOL_TYPE)],
        []
      ).identifier
    ).toBe('$SyntheticIDType1');

    expect(
      synthesizer.synthesizeClosureType(HIR_FUNCTION_TYPE([], HIR_INT_TYPE), []).identifier
    ).toBe('$SyntheticIDType2');
    expect(
      synthesizer.synthesizeClosureType(HIR_FUNCTION_TYPE([], HIR_INT_TYPE), []).identifier
    ).toBe('$SyntheticIDType2');
    expect(
      synthesizer.synthesizeClosureType(HIR_FUNCTION_TYPE([], HIR_BOOL_TYPE), []).identifier
    ).toBe('$SyntheticIDType3');
    expect(
      synthesizer.synthesizeClosureType(HIR_FUNCTION_TYPE([], HIR_BOOL_TYPE), []).identifier
    ).toBe('$SyntheticIDType3');

    expect(synthesizer.synthesizedTupleTypes.map(prettyPrintHighIRTypeDefinition)).toEqual([
      'object type $SyntheticIDType0 = [bool, (int) -> bool]',
      'object type $SyntheticIDType1 = [int, (bool) -> bool]',
    ]);
    expect(Array.from(synthesizer.tupleMappings.keys())).toEqual([
      '$SyntheticIDType0',
      '$SyntheticIDType1',
    ]);
    expect(synthesizer.synthesizedClosureTypes.map(prettyPrintHighIRClosureTypeDefinition)).toEqual(
      ['closure type $SyntheticIDType2 = () -> int', 'closure type $SyntheticIDType3 = () -> bool']
    );
    expect(Array.from(synthesizer.closureMappings.keys())).toEqual([
      '$SyntheticIDType2',
      '$SyntheticIDType3',
    ]);
  });

  it('collectUsedGenericTypes works', () => {
    const genericTypes = new Set(['A', 'B']);
    expect(Array.from(collectUsedGenericTypes(HIR_BOOL_TYPE, genericTypes))).toEqual([]);

    expect(
      Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('C'), genericTypes))
    ).toEqual([]);
    expect(
      Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE('A', [HIR_BOOL_TYPE]), genericTypes))
    ).toEqual([]);
    expect(
      Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'), genericTypes))
    ).toEqual(['A']);
    expect(
      Array.from(collectUsedGenericTypes(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'), genericTypes))
    ).toEqual(['B']);
    expect(
      Array.from(
        collectUsedGenericTypes(
          HIR_IDENTIFIER_TYPE('A', [HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B')]),
          genericTypes
        )
      )
    ).toEqual(['B']);

    expect(
      Array.from(
        collectUsedGenericTypes(
          HIR_FUNCTION_TYPE(
            [HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A')],
            HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B')
          ),
          genericTypes
        )
      )
    ).toEqual(['A', 'B']);
  });

  it('solveTypeArguments works', () => {
    expect(
      solveTypeArguments(
        [],
        HIR_IDENTIFIER_TYPE('Foo_bool', []),
        HIR_IDENTIFIER_TYPE('Foo', [HIR_BOOL_TYPE]),
        () => [HIR_BOOL_TYPE]
      )
    ).toEqual([]);

    expect(
      solveTypeArguments(
        [],
        HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
        HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('T'),
        (t) => [HIR_BOOL_TYPE, HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(t.name)]
      )
    ).toEqual([]);

    expect(
      solveTypeArguments(
        ['A'],
        HIR_FUNCTION_TYPE(
          [HIR_INT_TYPE, HIR_BOOL_TYPE],
          HIR_FUNCTION_TYPE(
            [
              HIR_IDENTIFIER_TYPE('Foo', [HIR_STRING_TYPE]),
              HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'),
            ],
            HIR_STRING_TYPE
          )
        ),
        HIR_FUNCTION_TYPE(
          [HIR_INT_TYPE, HIR_BOOL_TYPE],
          HIR_FUNCTION_TYPE(
            [
              HIR_IDENTIFIER_TYPE('Foo', [HIR_STRING_TYPE]),
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'),
            ],
            HIR_STRING_TYPE
          )
        ),
        () => []
      )
    ).toEqual([HIR_FUNCTION_TYPE([], HIR_INT_TYPE)]);
  });

  it('highIRTypeApplication works', () => {
    expect(highIRTypeApplication(HIR_BOOL_TYPE, {})).toEqual(HIR_BOOL_TYPE);
    expect(highIRTypeApplication(HIR_INT_TYPE, {})).toEqual(HIR_INT_TYPE);
    expect(highIRTypeApplication(HIR_STRING_TYPE, {})).toEqual(HIR_STRING_TYPE);

    expect(
      highIRTypeApplication(HIR_IDENTIFIER_TYPE('A', [HIR_INT_TYPE]), { A: HIR_INT_TYPE })
    ).toEqual(HIR_IDENTIFIER_TYPE('A', [HIR_INT_TYPE]));
    expect(
      highIRTypeApplication(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'), { B: HIR_INT_TYPE })
    ).toEqual(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'));
    expect(
      highIRTypeApplication(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'), { A: HIR_INT_TYPE })
    ).toEqual(HIR_INT_TYPE);

    expect(
      highIRTypeApplication(
        HIR_FUNCTION_TYPE(
          [HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A')],
          HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B')
        ),
        { A: HIR_INT_TYPE, B: HIR_BOOL_TYPE }
      )
    ).toEqual(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE));
  });

  it('resolveIdentifierTypeMappings works', () => {
    expect(() =>
      resolveIdentifierTypeMappings(
        HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
        () => undefined,
        () => undefined
      )
    ).toThrow();

    expect(
      resolveIdentifierTypeMappings(
        HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
        () => ({
          identifier: 'A',
          typeParameters: [],
          functionType: HIR_FUNCTION_TYPE([], HIR_BOOL_TYPE),
        }),
        () => undefined
      )
    ).toEqual([HIR_FUNCTION_TYPE([], HIR_BOOL_TYPE)]);

    expect(
      resolveIdentifierTypeMappings(
        HIR_IDENTIFIER_TYPE('A', [HIR_INT_TYPE]),
        () => undefined,
        () => ({
          identifier: 'A',
          type: 'object',
          typeParameters: ['B'],
          names: [],
          mappings: [HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B')],
        })
      )
    ).toEqual([HIR_INT_TYPE]);
  });

  it('encodeHighIRIdentifierTypeAfterGenericsSpecialization works', () => {
    expect(() =>
      encodeHighIRNameAfterGenericsSpecialization('A', [HIR_FUNCTION_TYPE([], HIR_INT_TYPE)])
    ).toThrow();

    expect(encodeHighIRNameAfterGenericsSpecialization('A', [])).toBe('A');

    expect(
      encodeHighIRNameAfterGenericsSpecialization('A', [
        HIR_INT_TYPE,
        HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'),
      ])
    ).toBe('A_int_B');
  });

  it('SamlangTypeLoweringManager.lowerSamlangType() works', () => {
    const typeSynthesizer = new HighIRTypeSynthesizer();
    const manager = new SamlangTypeLoweringManager(new Set(), typeSynthesizer);

    expect(manager.lowerSamlangType(SourceBoolType)).toEqual(HIR_BOOL_TYPE);
    expect(manager.lowerSamlangType(SourceIntType)).toEqual(HIR_INT_TYPE);
    expect(manager.lowerSamlangType(SourceUnitType)).toEqual(HIR_INT_TYPE);
    expect(manager.lowerSamlangType(SourceStringType)).toEqual(HIR_STRING_TYPE);

    expect(
      prettyPrintHighIRType(
        manager.lowerSamlangType(SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType]))
      )
    ).toBe('__DUMMY___A<int>');

    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          SourceTupleType([SourceIntType, SourceBoolType])
        )
      )
    ).toBe('$SyntheticIDType0');
    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          SourceTupleType([SourceIntType, SourceIdentifierType(ModuleReference.DUMMY, 'T')])
        )
      )
    ).toBe('$SyntheticIDType1<T>');

    expect(
      prettyPrintHighIRType(
        new SamlangTypeLoweringManager(new Set(['T']), typeSynthesizer).lowerSamlangType(
          SourceFunctionType(
            [SourceIdentifierType(ModuleReference.DUMMY, 'T'), SourceBoolType],
            SourceIntType
          )
        )
      )
    ).toBe('$SyntheticIDType2<T>');

    expect(() => manager.lowerSamlangType({ type: 'UndecidedType', index: 0 })).toThrow();

    expect(typeSynthesizer.synthesizedTupleTypes.map(prettyPrintHighIRTypeDefinition)).toEqual([
      'object type $SyntheticIDType0 = [int, bool]',
      'object type $SyntheticIDType1<T> = [int, T]',
    ]);
    expect(
      typeSynthesizer.synthesizedClosureTypes.map(prettyPrintHighIRClosureTypeDefinition)
    ).toEqual(['closure type $SyntheticIDType2<T> = (T, bool) -> int']);
  });

  it('SamlangTypeLoweringManager.lowerSamlangTypeDefinition() works', () => {
    const typeSynthesizer = new HighIRTypeSynthesizer();

    const typeDefinition = new SamlangTypeLoweringManager(
      new Set(['A']),
      typeSynthesizer
    ).lowerSamlangTypeDefinition(ModuleReference.ROOT, 'Foo', {
      range: Range.DUMMY,
      type: 'object',
      names: [SourceId('a'), SourceId('b')],
      mappings: {
        a: {
          type: SourceFunctionType(
            [SourceFunctionType([SourceIdentifierType(ModuleReference.ROOT, 'A')], SourceBoolType)],
            SourceBoolType
          ),
          isPublic: true,
        },
        b: {
          type: SourceFunctionType(
            [SourceFunctionType([SourceIdentifierType(ModuleReference.ROOT, 'A')], SourceBoolType)],
            SourceBoolType
          ),
          isPublic: false,
        },
      },
    });
    expect(
      [...typeSynthesizer.synthesizedTupleTypes, typeDefinition].map(
        prettyPrintHighIRTypeDefinition
      )
    ).toEqual(['object type _Foo<A> = [$SyntheticIDType1<A>, $SyntheticIDType1<A>]']);
    expect(
      typeSynthesizer.synthesizedClosureTypes.map(prettyPrintHighIRClosureTypeDefinition)
    ).toEqual([
      'closure type $SyntheticIDType0<A> = (A) -> bool',
      'closure type $SyntheticIDType1<A> = ($SyntheticIDType0<A>) -> bool',
    ]);
  });

  it('SamlangTypeLoweringManager.lowerSamlangFunctionTypeForTopLevel() works', () => {
    const manager = new SamlangTypeLoweringManager(new Set(['A']), new HighIRTypeSynthesizer());
    expect(
      manager.lowerSamlangFunctionTypeForTopLevel(
        SourceFunctionType([SourceIntType], SourceBoolType)
      )
    ).toEqual([[], HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE)]);

    expect(
      manager.lowerSamlangFunctionTypeForTopLevel(
        SourceFunctionType([SourceFunctionType([SourceIntType], SourceBoolType)], SourceBoolType)
      )
    ).toEqual([
      [],
      HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('$SyntheticIDType0')],
        HIR_BOOL_TYPE
      ),
    ]);
  });
});
