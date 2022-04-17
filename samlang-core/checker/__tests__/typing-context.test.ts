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
import { AccessibleGlobalTypingContext } from '../typing-context';

describe('typing-context', () => {
  it('AccessibleGlobalTypingContext tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReference.DUMMY,
      ModuleReferenceCollections.hashMapOf([
        ModuleReference.DUMMY,
        {
          interfaces: {
            I: {
              typeParameters: ['A', 'B'],
              functions: {},
              methods: {},
            },
          },
          classes: {
            A: {
              typeParameters: ['A', 'B'],
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
              functions: {
                f1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
                f2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
              },
              methods: {
                m1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType(
                    DummySourceReason,
                    [
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                    ],
                    SourceIntType(DummySourceReason)
                  ),
                },
                m2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
              },
            },
            B: {
              typeParameters: ['E', 'F'],
              typeDefinition: {
                location: Location.DUMMY,
                type: 'object',
                names: [],
                mappings: {},
              },
              functions: {
                f1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
                f2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
              },
              methods: {
                m1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
                m2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                },
              },
            },
          },
        },
      ]),
      new Set('T'),
      'A'
    );

    expect(context.getInterfaceInformation(ModuleReference.DUMMY, 'I')).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference(['A']), 'A', 'f1', Location.DUMMY)
    ).toBeFalsy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f1', Location.DUMMY)
    ).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f2', Location.DUMMY)
    ).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f3', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm1', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm2', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm3', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f1', Location.DUMMY)
    ).toBeTruthy();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f2', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f3', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm1', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm2', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm3', Location.DUMMY)
    ).toBeNull();
    expect(
      context.getClassMethodType(
        ModuleReference.DUMMY,
        'A',
        'm1',
        [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
        Location.DUMMY
      )
    ).toEqual({
      isPublic: true,
      type: SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
        SourceIntType(DummySourceReason)
      ),
      typeParameters: ['C'],
    });

    context.getCurrentClassTypeDefinition();

    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'object'
      ).type
    ).toBe('UnsupportedClassTypeDefinition');
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'object'
      )
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
        'variant'
      ).type
    ).toBe('IllegalOtherClassMatch');
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
          SourceIntType(DummySourceReason),
        ]),
        'variant'
      )
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
        'variant'
      )
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
      ])
    );

    context.withAdditionalTypeParameters(['A', 'B']);
    context.withAdditionalTypeParameters(new Set(['C', 'D']));
  });
});
