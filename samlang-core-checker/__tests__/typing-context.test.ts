import {
  intType,
  identifierType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core/ast/common-nodes';
import { hashMapOf } from 'samlang-core/utils';

import { AccessibleGlobalTypingContext } from '../typing-context';

describe('typing-context', () => {
  it('AccessibleGlobalTypingContext tests', () => {
    const context = new AccessibleGlobalTypingContext(
      ModuleReference.DUMMY,
      hashMapOf([
        ModuleReference.DUMMY,
        {
          A: {
            typeParameters: ['A', 'B'],
            typeDefinition: {
              range: Range.DUMMY,
              type: 'variant',
              names: ['a', 'b'],
              mappings: {
                a: { isPublic: true, type: identifierType(ModuleReference.DUMMY, 'A') },
                b: { isPublic: false, type: identifierType(ModuleReference.DUMMY, 'B') },
              },
            },
            functions: {
              f1: {
                isPublic: true,
                typeParameters: ['C'],
                type: functionType([], intType),
              },
              f2: {
                isPublic: false,
                typeParameters: ['C'],
                type: functionType([], intType),
              },
            },
            methods: {
              m1: {
                isPublic: true,
                typeParameters: ['C'],
                type: functionType(
                  [
                    identifierType(ModuleReference.DUMMY, 'A'),
                    identifierType(ModuleReference.DUMMY, 'B'),
                  ],
                  intType
                ),
              },
              m2: {
                isPublic: false,
                typeParameters: ['C'],
                type: functionType([], intType),
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
                type: functionType([], intType),
              },
              f2: {
                isPublic: false,
                typeParameters: ['C'],
                type: functionType([], intType),
              },
            },
            methods: {
              m1: {
                isPublic: true,
                typeParameters: ['C'],
                type: functionType([], intType),
              },
              m2: {
                isPublic: false,
                typeParameters: ['C'],
                type: functionType([], intType),
              },
            },
          },
        },
      ]),
      new Set('T'),
      'A'
    );

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
    expect(context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm1', [intType]).type).toBe(
      'TypeParameterSizeMismatch'
    );
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm1', [intType, intType])
    ).toEqual(functionType([intType, intType], intType));
    expect(
      context.getClassMethodType(ModuleReference.DUMMY, 'A', 'm2', [intType, intType]).type
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
      context.getClassMethodType(ModuleReference.DUMMY, 'B', 'm1', [intType, intType]).type
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
        identifierType(ModuleReference.DUMMY, 'A', [intType, intType]),
        'object'
      ).type
    ).toBe('UnsupportedClassTypeDefinition');
    expect(
      context.resolveTypeDefinition(
        identifierType(ModuleReference.DUMMY, 'B', [intType, intType]),
        'object'
      )
    ).toEqual({
      type: 'Resolved',
      names: [],
      mappings: {},
    });
    expect(
      context.resolveTypeDefinition(
        identifierType(ModuleReference.DUMMY, 'B', [intType, intType]),
        'variant'
      ).type
    ).toBe('IllegalOtherClassMatch');
    expect(
      context.resolveTypeDefinition(
        identifierType(ModuleReference.DUMMY, 'A', [intType, intType]),
        'variant'
      )
    ).toEqual({
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: { a: { isPublic: true, type: intType }, b: { isPublic: false, type: intType } },
    });

    expect(context.thisType).toEqual(
      identifierType(ModuleReference.DUMMY, 'A', [
        identifierType(ModuleReference.DUMMY, 'A'),
        identifierType(ModuleReference.DUMMY, 'B'),
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
