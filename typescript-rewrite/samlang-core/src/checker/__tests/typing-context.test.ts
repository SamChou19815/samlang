import { intType } from '../../ast/common/types';
import { LocalTypingContext } from '../typing-context';

it('basic methods test', () => {
  const context = new LocalTypingContext();
  expect(context.getLocalValueType('b')).toBeUndefined();
  context.addLocalValueType('a', intType, fail);
  expect(context.getLocalValueType('a')).toBe(intType);
  context.removeLocalValue('a');
  expect(() => context.removeLocalValue('a')).toThrow();
  context.withNestedScope(() => {});
});

it('can find conflicts in LocalTypingContext', () => {
  const context = new LocalTypingContext();
  context.addLocalValueType('a', intType, fail);
  let hasConflict = false;
  context.addLocalValueType('a', intType, () => {
    hasConflict = true;
  });
  expect(hasConflict).toBe(true);
});

it('can compute captured values in LocalTypingContext', () => {
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
