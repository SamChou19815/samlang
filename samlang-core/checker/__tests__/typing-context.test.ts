import {
  DummySourceReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import {
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
} from '../../ast/samlang-nodes';
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
        type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
      }),
    ).toBe('private foo() -> int');

    expect(
      memberTypeInformationToString('bar', {
        isPublic: true,
        typeParameters: [
          { name: 'T', bound: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A') },
        ],
        type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
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
                      type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                    },
                    b: {
                      isPublic: false,
                      type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                    },
                  },
                },
                extendsOrImplements: null,
                superTypes: [],
                functions: new Map([
                  [
                    'f1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
                    },
                  ],
                  [
                    'f2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [
                          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                        ],
                        SourceIntType(DummySourceReason),
                      ),
                    },
                  ],
                  [
                    'm2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
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
                extendsOrImplements: null,
                superTypes: [],
                functions: new Map([
                  [
                    'f1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
                    },
                  ],
                  [
                    'f2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
                    },
                  ],
                  [
                    'm2',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [],
                        SourceIntType(DummySourceReason),
                      ),
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
        [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
        Location.DUMMY,
      ),
    ).toEqual({
      isPublic: true,
      type: SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
        SourceIntType(DummySourceReason),
      ),
      typeParameters: [{ name: 'C', bound: null }],
    });

    context.getCurrentClassTypeDefinition();

    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'object',
      ).type,
    ).toBe('UnsupportedClassTypeDefinition');
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'object',
      ),
    ).toEqual({
      type: 'Resolved',
      names: [],
      mappings: {},
    });
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'variant',
      ).type,
    ).toBe('IllegalOtherClassMatch');
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'variant',
      ),
    ).toEqual({
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: {
        a: { isPublic: true, type: SourceIntType(DummySourceReason) },
        b: { isPublic: false, type: SourceIntType(DummySourceReason) },
      },
    });
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
        ]),
        'variant',
      ),
    ).toEqual({
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: {
        a: { isPublic: true, type: SourceIntType(DummySourceReason) },
        b: {
          isPublic: false,
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        },
      },
    });

    expect(context.thisType).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
      ]),
    );

    context.withAdditionalTypeParameters(['A', 'B']);
    context.withAdditionalTypeParameters(new Set(['C', 'D']));
  });
});
