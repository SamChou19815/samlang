import Range from '../../ast/common/range';
import { intType, identifierType, functionType } from '../../ast/common/types';
import { LocalTypingContext, AccessibleGlobalTypingContext } from '../typing-context';

it('LocalTypingContext basic methods test.', () => {
  const context = new LocalTypingContext();
  expect(context.getLocalValueType('b')).toBeUndefined();
  context.addLocalValueType('a', intType, fail);
  expect(context.getLocalValueType('a')).toBe(intType);
  context.removeLocalValue('a');
  expect(() => context.removeLocalValue('a')).toThrow();
  context.withNestedScope(() => {});
});

it('LocalTypingContext can find conflicts.', () => {
  const context = new LocalTypingContext();
  context.addLocalValueType('a', intType, fail);
  let hasConflict = false;
  context.addLocalValueType('a', intType, () => {
    hasConflict = true;
  });
  expect(hasConflict).toBe(true);
});

it('LocalTypingContext can compute captured values.', () => {
  const context = new LocalTypingContext();
  context.addLocalValueType('a', intType, fail);
  context.addLocalValueType('b', intType, fail);
  const [_outer, capturedOuter] = context.withNestedScopeReturnCaptured(() => {
    expect(() =>
      context.addLocalValueType('a', intType, () => {
        throw new Error();
      })
    ).toThrow();
    context.addLocalValueType('c', intType, fail);
    context.addLocalValueType('d', intType, fail);
    context.getLocalValueType('a');
    const [_inner, capturedInner] = context.withNestedScopeReturnCaptured(() => {
      context.getLocalValueType('a');
      context.getLocalValueType('b');
      context.getLocalValueType('d');
    });
    expect(Array.from(capturedInner.keys())).toEqual(['a', 'b', 'd']);
  });

  expect(Array.from(capturedOuter.keys())).toEqual(['a', 'b']);
});

it('AccessibleGlobalTypingContext tests', () => {
  const context = new AccessibleGlobalTypingContext(
    {
      A: {
        typeParameters: ['A', 'B'],
        typeDefinition: {
          range: Range.DUMMY,
          type: 'variant',
          names: ['a', 'b'],
          mappings: {
            a: { isPublic: true, type: identifierType('A') },
            b: { isPublic: false, type: identifierType('B') },
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
            type: functionType([identifierType('A'), identifierType('B')], intType),
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
    new Set('T'),
    'A'
  );

  expect(context.getClassFunctionType('A', 'f1')).toBeTruthy();
  expect(context.getClassFunctionType('A', 'f2')).toBeTruthy();
  expect(context.getClassFunctionType('A', 'f3')).toBeNull();
  expect(context.getClassFunctionType('A', 'm1')).toBeNull();
  expect(context.getClassFunctionType('A', 'm2')).toBeNull();
  expect(context.getClassFunctionType('A', 'm3')).toBeNull();
  expect(context.getClassFunctionType('B', 'f1')).toBeTruthy();
  expect(context.getClassFunctionType('B', 'f2')).toBeNull();
  expect(context.getClassFunctionType('B', 'f3')).toBeNull();
  expect(context.getClassFunctionType('B', 'm1')).toBeNull();
  expect(context.getClassFunctionType('B', 'm2')).toBeNull();
  expect(context.getClassFunctionType('B', 'm3')).toBeNull();

  expect(context.getClassMethodType('A', 'f1', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('A', 'f2', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('A', 'f3', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('A', 'm1', [intType]).type).toBe('TypeParameterSizeMismatch');
  expect(context.getClassMethodType('A', 'm1', [intType, intType])).toEqual(
    functionType([intType, intType], intType)
  );
  expect(context.getClassMethodType('A', 'm2', [intType, intType]).type).toBe('FunctionType');
  expect(context.getClassMethodType('A', 'm3', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('B', 'f1', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('B', 'f2', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('B', 'f3', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('B', 'm1', [intType, intType]).type).toBe('FunctionType');
  expect(context.getClassMethodType('B', 'm2', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('B', 'm3', []).type).toBe('UnresolvedName');
  expect(context.getClassMethodType('C', 'm3', []).type).toBe('UnresolvedName');

  context.getCurrentClassTypeDefinition();

  expect(
    context.resolveTypeDefinition(identifierType('A', [intType, intType]), 'object').type
  ).toBe('UnsupportedClassTypeDefinition');
  expect(context.resolveTypeDefinition(identifierType('B', [intType, intType]), 'object')).toEqual({
    type: 'Resolved',
    names: [],
    mappings: {},
  });
  expect(
    context.resolveTypeDefinition(identifierType('B', [intType, intType]), 'variant').type
  ).toBe('IllegalOtherClassMatch');
  expect(context.resolveTypeDefinition(identifierType('A', [intType]), 'variant').type).toBe(
    'TypeParamSizeMismatch'
  );
  expect(context.resolveTypeDefinition(identifierType('A', [intType, intType]), 'variant')).toEqual(
    {
      type: 'Resolved',
      names: ['a', 'b'],
      mappings: { a: { isPublic: true, type: intType }, b: { isPublic: false, type: intType } },
    }
  );

  expect(context.thisType).toEqual(identifierType('A', [identifierType('A'), identifierType('B')]));

  expect(context.identifierTypeIsWellDefined('A', 2)).toBeTruthy();
  expect(context.identifierTypeIsWellDefined('B', 2)).toBeTruthy();
  expect(context.identifierTypeIsWellDefined('A', 1)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('B', 1)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('A', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('B', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('C', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('D', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('E', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('F', 0)).toBeFalsy();
  expect(context.identifierTypeIsWellDefined('T', 0)).toBeTruthy();
  expect(context.identifierTypeIsWellDefined('T', 1)).toBeFalsy();

  context.withAdditionalTypeParameters(['A', 'B']);
  context.withAdditionalTypeParameters(new Set(['C', 'D']));
});
