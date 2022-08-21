import { Location, ModuleReference, ModuleReferenceCollections } from '../../ast/common-nodes';
import { AstBuilder, SourceId } from '../../ast/samlang-nodes';
import {
  AccessibleGlobalTypingContext,
  ClassTypingContext,
  createBuiltinFunction,
  createPrivateBuiltinFunction,
  InterfaceTypingContext,
  memberTypeInformationToString,
  ModuleTypingContext,
} from '../typing-context';

describe('typing-context', () => {
  it('memberTypeInformationToString tests', () => {
    expect(
      memberTypeInformationToString('foo', {
        isPublic: false,
        typeParameters: [],
        type: AstBuilder.FunType([], AstBuilder.IntType),
      }),
    ).toBe('private foo() -> int');

    expect(
      memberTypeInformationToString('bar', {
        isPublic: true,
        typeParameters: [{ name: 'T', bound: AstBuilder.IdType('A') }],
        type: AstBuilder.FunType([], AstBuilder.IntType),
      }),
    ).toBe('public bar<T: A>() -> int');
  });

  it('AccessibleGlobalTypingContext.isSubtype tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
        ModuleReference.DUMMY,
        {
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
          classes: new Map(),
        },
      ]),
      ModuleReference.DUMMY,
      'A',
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

  it('AccessibleGlobalTypingContext get member tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>([
        ModuleReference.DUMMY,
        {
          interfaces: new Map(),
          classes: new Map<string, ClassTypingContext>([
            [
              'A',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'variant',
                  names: [SourceId('a'), SourceId('b')],
                  mappings: {
                    a: { isPublic: true, type: AstBuilder.IdType('A') },
                    b: { isPublic: false, type: AstBuilder.IdType('B') },
                  },
                },
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
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'object',
                  names: [],
                  mappings: {},
                },
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
      ModuleReference.DUMMY,
      'A',
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
  });

  it('AccessibleGlobalTypingContext.resolveTypeDefinition tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReferenceCollections.hashMapOf([
        ModuleReference.DUMMY,
        {
          interfaces: new Map(),
          classes: new Map<string, ClassTypingContext>([
            [
              'A',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'variant',
                  names: [SourceId('a'), SourceId('b')],
                  mappings: {
                    a: { isPublic: true, type: AstBuilder.IdType('A') },
                    b: { isPublic: false, type: AstBuilder.IdType('B') },
                  },
                },
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
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'object',
                  names: [],
                  mappings: {},
                },
                superTypes: [],
                functions: new Map(),
                methods: new Map(),
              },
            ],
          ]),
        },
      ]),
      ModuleReference.DUMMY,
      'A',
    );

    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.IntType]),
        'object',
      ).type,
    ).toBe('UnsupportedClassTypeDefinition');
    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('B', [AstBuilder.IntType, AstBuilder.IntType]),
        'object',
      ),
    ).toEqual({
      type: 'Resolved',
      names: [],
      mappings: {},
    });
    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('B', [AstBuilder.IntType, AstBuilder.IntType]),
        'variant',
      ).type,
    ).toBe('IllegalOtherClassMatch');
    expect(
      context.resolveTypeDefinition(
        AstBuilder.IdType('A', [AstBuilder.IntType, AstBuilder.IntType]),
        'variant',
      ),
    ).toEqual({
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: {
        a: { isPublic: true, type: AstBuilder.IntType },
        b: { isPublic: false, type: AstBuilder.IntType },
      },
    });
    expect(
      context.resolveTypeDefinition(AstBuilder.IdType('A', [AstBuilder.IntType]), 'variant'),
    ).toEqual({
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: {
        a: { isPublic: true, type: AstBuilder.IntType },
        b: {
          isPublic: false,
          type: AstBuilder.IdType('B'),
        },
      },
    });
  });
});
