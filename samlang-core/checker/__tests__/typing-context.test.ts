import { DummySourceReason, ModuleReference, Range } from '../../ast/common-nodes';
import {
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
} from '../../ast/samlang-nodes';
import { hashMapOf } from '../../utils';
import { AccessibleGlobalTypingContext } from '../typing-context';

describe('typing-context', () => {
  it('AccessibleGlobalTypingContext tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReference.DUMMY,
      hashMapOf([
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
                range: Range.DUMMY,
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
                range: Range.DUMMY,
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
    expect(context.getClassFunctionType(new ModuleReference(['A']), 'A', 'f1')).toBeFalsy();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f1')).toBeTruthy();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f2')).toBeTruthy();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'f3')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm1')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm2')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'A', 'm3')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f1')).toBeTruthy();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f2')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'f3')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm1')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm2')).toBeNull();
    expect(context.getClassFunctionType(ModuleReference.DUMMY, 'B', 'm3')).toBeNull();

    expect(context.getClassMethodType(new ModuleReference(['A']), 'A', 'f1', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'A', 'f1', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'A', 'f2', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'A', 'f3', []).type).toBe(
      'UnresolvedName'
    );
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm1', [
        SourceIntType(DummySourceReason),
      ]).type
    ).toBe('TypeParameterSizeMismatch');
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm1', [
        SourceIntType(DummySourceReason),
        SourceIntType(DummySourceReason),
      ])
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
        SourceIntType(DummySourceReason)
      )
    );
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm2', [
        SourceIntType(DummySourceReason),
        SourceIntType(DummySourceReason),
      ]).type
    ).toBe('FunctionType');
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm3', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'B', 'f1', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'B', 'f2', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'B', 'f3', []).type).toBe(
      'UnresolvedName'
    );
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'B', 'm1', [
        SourceIntType(DummySourceReason),
        SourceIntType(DummySourceReason),
      ]).type
    ).toBe('FunctionType');
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'B', 'm2', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'B', 'm3', []).type).toBe(
      'UnresolvedName'
    );
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'C', 'm3', []).type).toBe(
      'UnresolvedName'
    );

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
