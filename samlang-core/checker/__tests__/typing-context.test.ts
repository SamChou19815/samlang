import { Location, ModuleReference, ModuleReferenceCollections } from '../../ast/common-nodes';
import { AstBuilder, prettyPrintType, SourceId } from '../../ast/samlang-nodes';
import {
  AccessibleGlobalTypingContext,
  ClassTypingContext,
  memberTypeInformationToString,
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

  it('AccessibleGlobalTypingContext tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReference.DUMMY,
      ModuleReferenceCollections.hashMapOf([
        ModuleReference.DUMMY,
        {
          interfaces: new Map([
            [
              'I',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: null,
                superTypes: [],
                functions: new Map(),
                methods: new Map(),
              },
            ],
          ]),
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
                    a: {
                      isPublic: true,
                      type: AstBuilder.IdType('A'),
                    },
                    b: {
                      isPublic: false,
                      type: AstBuilder.IdType('B'),
                    },
                  },
                },
                superTypes: [],
                functions: new Map([
                  [
                    'f1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                  [
                    'f2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType(
                        [AstBuilder.IdType('A'), AstBuilder.IdType('B')],
                        AstBuilder.IntType,
                      ),
                    },
                  ],
                  [
                    'm2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
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
                  [
                    'f1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                  [
                    'f2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                  [
                    'm2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                ]),
              },
            ],
          ]),
        },
      ]),
      new Set('T'),
      'A',
    );

    expect(context.getInterfaceInformation(ModuleReference.DUMMY, 'I')).toBeTruthy();

    expect(
      context.getClassFunctionType(ModuleReference(['A']), 'A', 'f1', Location.DUMMY),
    ).toBeFalsy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f1', Location.DUMMY),
    ).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f2', Location.DUMMY),
    ).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f3', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm1', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm2', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm3', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f1', Location.DUMMY),
    ).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f2', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f3', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm1', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm2', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm3', Location.DUMMY),
    ).toBeNull();
    expect(
      context.getClassMethodType(
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

    context.getCurrentClassTypeDefinition();

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

    expect(prettyPrintType(context.thisType)).toBe('A<A, B>');

    context.withAdditionalTypeParameters(['A', 'B']);
    context.withAdditionalTypeParameters(new Set(['C', 'D']));
  });
});
