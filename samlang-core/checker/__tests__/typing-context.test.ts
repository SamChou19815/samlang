import {
  DummySourceReason,
  Location,
  LocationCollections,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import { AstBuilder } from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { createBuiltinFunction, createPrivateBuiltinFunction } from '../builtins';
import type { SsaAnalysisResult } from '../ssa-analysis';
import {
  InterfaceTypingContext,
  LocationBasedLocalTypingContext,
  ModuleTypingContext,
  TypeDefinitionTypingContext,
  TypingContext,
} from '../typing-context';

const EMPTY_SSA_ANALYSIS_RESULT_FOR_MOCKING: SsaAnalysisResult = {
  unboundNames: new Set(),
  invalidDefines: LocationCollections.setOf(),
  definitionToUsesMap: LocationCollections.mapOf(),
  useDefineMap: LocationCollections.mapOf(),
  lambdaCaptures: LocationCollections.mapOf(),
};

describe('typing-context', () => {
  it('TypingContext.isSubtype tests', () => {
    const context = new TypingContext(
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
        ModuleReference.DUMMY,
        {
          typeDefinitions: new Map(),
          interfaces: new Map<string, InterfaceTypingContext>([
            [
              'A',
              {
                typeParameters: [{ name: 'T', bound: null }],
                superTypes: [AstBuilder.IdType('B', [AstBuilder.IdType('T'), AstBuilder.IntType])],
                functions: new Map(),
                methods: new Map(),
              },
            ],
          ]),
        },
      ]),
      new LocationBasedLocalTypingContext(EMPTY_SSA_ANALYSIS_RESULT_FOR_MOCKING),
      createGlobalErrorCollector().getErrorReporter(),
      ModuleReference.DUMMY,
      'A',
      /* availableTypeParameters */ [],
    );

    // Non-id lower type
    expect(context.isSubtype(AstBuilder.IntType, AstBuilder.IdType('B'))).toBeFalsy();
    // Non-existent type
    expect(context.isSubtype(AstBuilder.IdType('B'), AstBuilder.IdType('B'))).toBeFalsy();
    // Type-args length mismatch
    expect(context.isSubtype(AstBuilder.IdType('A'), AstBuilder.IdType('B'))).toBeFalsy();
    // Type-args mismatch
    expect(
      context.isSubtype(
        AstBuilder.IdType('A', [AstBuilder.IntType]),
        AstBuilder.IdType('B', [AstBuilder.StringType, AstBuilder.IntType]),
      ),
    ).toBeFalsy();
    expect(
      context.isSubtype(
        AstBuilder.IdType('A', [AstBuilder.StringType]),
        AstBuilder.IdType('B', [AstBuilder.StringType, AstBuilder.StringType]),
      ),
    ).toBeFalsy();
    // Good
    expect(
      context.isSubtype(
        AstBuilder.IdType('A', [AstBuilder.StringType]),
        AstBuilder.IdType('B', [AstBuilder.StringType, AstBuilder.IntType]),
      ),
    ).toBeTruthy();
  });

  it('TypingContext.validateTypeInstantiation tests', () => {
    const errorCollector = createGlobalErrorCollector();
    const context = new TypingContext(
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
        ModuleReference.DUMMY,
        {
          typeDefinitions: new Map(),
          interfaces: new Map<string, InterfaceTypingContext>([
            [
              'A',
              {
                typeParameters: [
                  { name: 'T1', bound: null },
                  { name: 'T2', bound: AstBuilder.IdType('A') },
                ],
                superTypes: [],
                functions: new Map(),
                methods: new Map(),
              },
            ],
          ]),
        },
      ]),
      new LocationBasedLocalTypingContext(EMPTY_SSA_ANALYSIS_RESULT_FOR_MOCKING),
      errorCollector.getErrorReporter(),
      ModuleReference.DUMMY,
      'A',
      /* availableTypeParameters */ [{ name: 'TPARAM', bound: null }],
    );

    context.validateTypeInstantiation(AstBuilder.IntType);
    context.validateTypeInstantiation(
      AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
    );
    context.validateTypeInstantiation({ __type__: 'UnknownType', reason: DummySourceReason });
    context.validateTypeInstantiation(AstBuilder.IdType('TPARAM'));
    context.validateTypeInstantiation(AstBuilder.IdType('TPARAM', [AstBuilder.IntType]));
    context.validateTypeInstantiation(AstBuilder.IdType('T'));
    context.validateTypeInstantiation(AstBuilder.IdType('A'));
    context.validateTypeInstantiation(
      AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.IntType]),
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([
      '__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.',
      '__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.',
      '__DUMMY__.sam:0:0-0:0: [UnexpectedSubType]: Expected: subtype of `A`, actual: `int`.',
    ]);
  });

  it('TypingContext get member tests', () => {
    const context = new TypingContext(
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
        ModuleReference.DUMMY,
        {
          typeDefinitions: new Map<string, TypeDefinitionTypingContext>([
            [
              'A',
              {
                type: 'variant',
                names: ['a', 'b'],
                mappings: new Map([
                  ['a', { isPublic: true, type: AstBuilder.IdType('A') }],
                  ['b', { isPublic: false, type: AstBuilder.IdType('B') }],
                ]),
              },
            ],
          ]),
          interfaces: new Map<string, InterfaceTypingContext>([
            [
              'A',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                superTypes: [],
                functions: new Map([
                  createBuiltinFunction('f1', [], AstBuilder.IntType, ['C']),
                  createBuiltinFunction('f2', [], AstBuilder.IntType, ['C']),
                ]),
                methods: new Map([
                  createBuiltinFunction(
                    'm1',
                    [AstBuilder.IdType('A'), AstBuilder.IdType('B')],
                    AstBuilder.IntType,
                    ['C'],
                  ),
                  createBuiltinFunction('m2', [], AstBuilder.IntType, ['C']),
                ]),
              },
            ],
            [
              'B',
              {
                typeParameters: [
                  { name: 'E', bound: null },
                  { name: 'F', bound: null },
                ],
                superTypes: [],
                functions: new Map([
                  createBuiltinFunction('f1', [], AstBuilder.IntType, ['C']),
                  createPrivateBuiltinFunction('f2', [], AstBuilder.IntType, ['C']),
                ]),
                methods: new Map([
                  createBuiltinFunction('m1', [], AstBuilder.IntType, ['C']),
                  createPrivateBuiltinFunction('m2', [], AstBuilder.IntType, ['C']),
                ]),
              },
            ],
          ]),
        },
      ]),
      new LocationBasedLocalTypingContext(EMPTY_SSA_ANALYSIS_RESULT_FOR_MOCKING),
      createGlobalErrorCollector().getErrorReporter(),
      ModuleReference.DUMMY,
      'A',
      /* availableTypeParameters */ [
        { name: 'TT1', bound: AstBuilder.IdType('A') },
        { name: 'TT2', bound: null },
        { name: 'TT3', bound: AstBuilder.IdType('sdfasdfasfs') },
      ],
    );

    expect(context.getFunctionType(ModuleReference(['A']), 'A', 'f1', Location.DUMMY)).toBeFalsy();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'A', 'f1', Location.DUMMY)).toBeTruthy();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'A', 'f2', Location.DUMMY)).toBeTruthy();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'A', 'f3', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'A', 'm1', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'A', 'm2', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'A', 'm3', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'B', 'f1', Location.DUMMY)).toBeTruthy();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'B', 'f2', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'B', 'f3', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'B', 'm1', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'B', 'm2', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'B', 'm3', Location.DUMMY)).toBeNull();
    expect(
      context.getMethodType(
        ModuleReference.DUMMY,
        'A',
        'm1',
        [AstBuilder.IntType, AstBuilder.IntType],
        Location.DUMMY,
      ),
    ).toEqual({
      isPublic: true,
      type: AstBuilder.FunType([AstBuilder.IntType, AstBuilder.IntType], AstBuilder.IntType),
      typeParameters: [{ name: 'C', bound: null }],
    });

    // Read through the type parameter bound.
    expect(context.getFunctionType(ModuleReference.DUMMY, 'TT1', 'f1', Location.DUMMY)).toEqual(
      createBuiltinFunction('f1', [], AstBuilder.IntType, ['C'])[1],
    );
    expect(context.getFunctionType(ModuleReference.DUMMY, 'TT2', 'f1', Location.DUMMY)).toBeNull();
    expect(context.getFunctionType(ModuleReference.DUMMY, 'TT3', 'f1', Location.DUMMY)).toBeNull();
  });

  it('TypingContext.resolveTypeDefinition tests', () => {
    const context = new TypingContext(
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
        ModuleReference.DUMMY,
        {
          typeDefinitions: new Map<string, TypeDefinitionTypingContext>([
            [
              'A',
              {
                type: 'variant',
                names: ['a', 'b'],
                mappings: new Map([
                  ['a', { isPublic: true, type: AstBuilder.IdType('A') }],
                  ['b', { isPublic: false, type: AstBuilder.IdType('B') }],
                ]),
              },
            ],
            ['B', { type: 'object', names: [], mappings: new Map() }],
          ]),
          interfaces: new Map<string, InterfaceTypingContext>([
            [
              'A',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                superTypes: [],
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'B',
              {
                typeParameters: [
                  { name: 'E', bound: null },
                  { name: 'F', bound: null },
                ],
                superTypes: [],
                functions: new Map(),
                methods: new Map(),
              },
            ],
          ]),
        },
      ]),
      new LocationBasedLocalTypingContext(EMPTY_SSA_ANALYSIS_RESULT_FOR_MOCKING),
      createGlobalErrorCollector().getErrorReporter(),
      ModuleReference.DUMMY,
      'A',
      /* availableTypeParameters */ [],
    );

    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.IntType]),
        'object',
      ),
    ).toEqual({
      names: [],
      mappings: new Map(),
    });
    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('B', [AstBuilder.IntType, AstBuilder.IntType]),
        'object',
      ),
    ).toEqual({
      names: [],
      mappings: new Map(),
    });
    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.IntType]),
        'variant',
      ),
    ).toEqual({
      names: ['a', 'b'],
      mappings: new Map([
        ['a', { isPublic: true, type: AstBuilder.IntType }],
        ['b', { isPublic: false, type: AstBuilder.IntType }],
      ]),
    });
    expect(
      context.resolveTypeDefinition(AstBuilder.IdType('A', [AstBuilder.IntType]), 'variant'),
    ).toEqual({
      names: ['a', 'b'],
      mappings: new Map([
        ['a', { isPublic: true, type: AstBuilder.IntType }],
        ['b', { isPublic: false, type: AstBuilder.IdType('B') }],
      ]),
    });
  });
});
