import { AccessibleGlobalTypingContext } from '../typing-context';

import {
  intType,
  identifierType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import { hashMapOf } from 'samlang-core-utils';

it('AccessibleGlobalTypingContext tests', () => {
  const context = new AccessibleGlobalTypingContext(
    ModuleReference.ROOT,
    hashMapOf([
      ModuleReference.ROOT,
      {
        A: {
          typeParameters: ['A', 'B'],
          typeDefinition: {
            range: Range.DUMMY,
            type: 'variant',
            names: ['a', 'b'],
            mappings: {
              a: { isPublic: true, type: identifierType(ModuleReference.ROOT, 'A') },
              b: { isPublic: false, type: identifierType(ModuleReference.ROOT, 'B') },
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
                  identifierType(ModuleReference.ROOT, 'A'),
                  identifierType(ModuleReference.ROOT, 'B'),
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
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'A', 'f1')).toBeTruthy();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'A', 'f2')).toBeTruthy();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'A', 'f3')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'A', 'm1')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'A', 'm2')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'A', 'm3')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'B', 'f1')).toBeTruthy();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'B', 'f2')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'B', 'f3')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'B', 'm1')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'B', 'm2')).toBeNull();
  expect(context.getClassFunctionType(ModuleReference.ROOT, 'B', 'm3')).toBeNull();

  expect(context.getClassMethodType(new ModuleReference(['A']), 'A', 'f1', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'f1', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'f2', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'f3', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'm1', [intType]).type).toBe(
    'TypeParameterSizeMismatch'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'm1', [intType, intType])).toEqual(
    functionType([intType, intType], intType)
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'm2', [intType, intType]).type).toBe(
    'FunctionType'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'A', 'm3', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'B', 'f1', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'B', 'f2', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'B', 'f3', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'B', 'm1', [intType, intType]).type).toBe(
    'FunctionType'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'B', 'm2', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'B', 'm3', []).type).toBe(
    'UnresolvedName'
  );
  expect(context.getClassMethodType(ModuleReference.ROOT, 'C', 'm3', []).type).toBe(
    'UnresolvedName'
  );

  context.getCurrentClassTypeDefinition();

  expect(
    context.resolveTypeDefinition(
      identifierType(ModuleReference.ROOT, 'A', [intType, intType]),
      'object'
    ).type
  ).toBe('UnsupportedClassTypeDefinition');
  expect(
    context.resolveTypeDefinition(
      identifierType(ModuleReference.ROOT, 'B', [intType, intType]),
      'object'
    )
  ).toEqual({
    type: 'Resolved',
    names: [],
    mappings: {},
  });
  expect(
    context.resolveTypeDefinition(
      identifierType(ModuleReference.ROOT, 'B', [intType, intType]),
      'variant'
    ).type
  ).toBe('IllegalOtherClassMatch');
  expect(
    context.resolveTypeDefinition(
      identifierType(ModuleReference.ROOT, 'A', [intType, intType]),
      'variant'
    )
  ).toEqual({
    type: 'Resolved',
    names: ['a', 'b'],
    mappings: { a: { isPublic: true, type: intType }, b: { isPublic: false, type: intType } },
  });

  expect(context.thisType).toEqual(
    identifierType(ModuleReference.ROOT, 'A', [
      identifierType(ModuleReference.ROOT, 'A'),
      identifierType(ModuleReference.ROOT, 'B'),
    ])
  );

  expect(context.identifierTypeIsWellDefined(new ModuleReference(['A']), 'A', 2)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'A', 2)).toBeTruthy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'B', 2)).toBeTruthy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'A', 1)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'B', 1)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'A', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'B', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'C', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'D', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'E', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'F', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'T', 0)).toBeTruthy();
  expect(context.identifierTypeIsWellDefined(ModuleReference.ROOT, 'T', 1)).toBeFalsy();

  context.withAdditionalTypeParameters(['A', 'B']);
  context.withAdditionalTypeParameters(new Set(['C', 'D']));
});
