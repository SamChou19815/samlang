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
import { checkNotNull } from '../../utils';
import { AccessibleGlobalTypingContext, ClassTypingContext } from '../typing-context';

describe('typing-context', () => {
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
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'IUseNonExistent',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: SourceIdentifierType(
                  DummySourceReason,
                  ModuleReference.DUMMY,
                  'not_exist',
                ),
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'IBase',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: null,
                functions: new Map(),
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
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
                      ),
                    },
                  ],
                ]),
              },
            ],
            [
              'ILevel1',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: SourceIdentifierType(
                  DummySourceReason,
                  ModuleReference.DUMMY,
                  'IBase',
                  [
                    SourceIntType(DummySourceReason),
                    SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                  ],
                ),
                functions: new Map([
                  [
                    'f1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [
                          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                        ],
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
                      ),
                    },
                  ],
                ]),
                methods: new Map(),
              },
            ],
            [
              'ILevel2',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: SourceIdentifierType(
                  DummySourceReason,
                  ModuleReference.DUMMY,
                  'ILevel1',
                  [
                    SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                    SourceIntType(DummySourceReason),
                  ],
                ),
                functions: new Map(),
                methods: new Map([
                  [
                    'm2',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: SourceFunctionType(
                        DummySourceReason,
                        [
                          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                        ],
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
                      ),
                    },
                  ],
                ]),
              },
            ],
            [
              'ICyclic1',
              {
                typeParameters: [],
                extendsOrImplements: SourceIdentifierType(
                  DummySourceReason,
                  ModuleReference.DUMMY,
                  'ICyclic2',
                ),
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'ICyclic2',
              {
                typeParameters: [],
                extendsOrImplements: SourceIdentifierType(
                  DummySourceReason,
                  ModuleReference.DUMMY,
                  'ICyclic1',
                ),
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
      context.getFullyInlinedInterfaceContext(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'I_not_exist'),
      )?.context,
    ).toEqual({
      functions: new Map(),
      methods: new Map(),
    });
    expect(
      context.getFullyInlinedInterfaceContext(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'IUseNonExistent'),
      )?.context,
    ).toEqual({
      functions: new Map(),
      methods: new Map(),
    });
    expect(
      context.getFullyInlinedInterfaceContext(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'I'),
      )?.context,
    ).toEqual({
      functions: new Map(),
      methods: new Map(),
    });
    expect(
      checkNotNull(
        context.getFullyInlinedInterfaceContext(
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ILevel2'),
        ),
      ).context,
    ).toEqual({
      functions: new Map([
        [
          'f1',
          {
            isPublic: true,
            typeParameters: [{ name: 'C', bound: null }],
            type: SourceFunctionType(
              DummySourceReason,
              [
                SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
              ],
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
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
              [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
            ),
          },
        ],
        [
          'm2',
          {
            isPublic: true,
            typeParameters: [{ name: 'C', bound: null }],
            type: SourceFunctionType(
              DummySourceReason,
              [
                SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
              ],
              SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
            ),
          },
        ],
      ]),
    });

    expect(
      context.getFullyInlinedInterfaceContext(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ICyclic1'),
      ).cyclicType,
    ).toEqual(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ICyclic1'));
    expect(
      context.getFullyInlinedInterfaceContext(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ICyclic2'),
      ).cyclicType,
    ).toEqual(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ICyclic2'));

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
