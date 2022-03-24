import { ModuleReference, Range } from '../../ast/common-nodes';
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
                  a: { isPublic: true, type: SourceIdentifierType(ModuleReference.DUMMY, 'A') },
                  b: { isPublic: false, type: SourceIdentifierType(ModuleReference.DUMMY, 'B') },
                },
              },
              functions: {
                f1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType([], SourceIntType),
                },
                f2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType([], SourceIntType),
                },
              },
              methods: {
                m1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType(
                    [
                      SourceIdentifierType(ModuleReference.DUMMY, 'A'),
                      SourceIdentifierType(ModuleReference.DUMMY, 'B'),
                    ],
                    SourceIntType
                  ),
                },
                m2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType([], SourceIntType),
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
                  type: SourceFunctionType([], SourceIntType),
                },
                f2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType([], SourceIntType),
                },
              },
              methods: {
                m1: {
                  isPublic: true,
                  typeParameters: ['C'],
                  type: SourceFunctionType([], SourceIntType),
                },
                m2: {
                  isPublic: false,
                  typeParameters: ['C'],
                  type: SourceFunctionType([], SourceIntType),
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
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm1', [SourceIntType]).type).toBe(
      'TypeParameterSizeMismatch'
    );
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm1', [SourceIntType, SourceIntType])
    ).toEqual(SourceFunctionType([SourceIntType, SourceIntType], SourceIntType));
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm2', [SourceIntType, SourceIntType])
        .type
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
      context.getClassMethodType(ModuleReference.DUMMY, 'B', 'm1', [SourceIntType, SourceIntType])
        .type
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
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceIntType]),
        'object'
      ).type
    ).toBe('UnsupportedClassTypeDefinition');
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(ModuleReference.DUMMY, 'B', [SourceIntType, SourceIntType]),
        'object'
      )
    ).toEqual({
      type: 'Resolved',
      names: [],
      mappings: {},
    });
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(ModuleReference.DUMMY, 'B', [SourceIntType, SourceIntType]),
        'variant'
      ).type
    ).toBe('IllegalOtherClassMatch');
    expect(
      context.resolveTypeDefinition(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType, SourceIntType]),
        'variant'
      )
    ).toEqual({
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: {
        a: { isPublic: true, type: SourceIntType },
        b: { isPublic: false, type: SourceIntType },
      },
    });

    expect(context.thisType).toEqual(
      SourceIdentifierType(ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
      ])
    );

    expect(context.identifierTypeIsWellDefined(new ModuleReference(['A']), 'A', 2)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'A', 2)).toBeTruthy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'B', 2)).toBeTruthy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'A', 1)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'B', 1)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'A', 0)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'B', 0)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'C', 0)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'D', 0)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'E', 0)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'F', 0)).toBeFalsy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'T', 0)).toBeTruthy();
    expect(context.identifierTypeIsWellDefined(ModuleReference.DUMMY, 'T', 1)).toBeFalsy();

    context.withAdditionalTypeParameters(['A', 'B']);
    context.withAdditionalTypeParameters(new Set(['C', 'D']));
  });
});
