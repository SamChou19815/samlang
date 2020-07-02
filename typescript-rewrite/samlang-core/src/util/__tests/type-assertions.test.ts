import { isNotNull, assertNotNull } from '../type-assertions';

it('isNotNull tests', () => {
  expect(isNotNull(2)).toBeTruthy();
  expect(isNotNull('2')).toBeTruthy();
  expect(isNotNull([3])).toBeTruthy();
  expect(isNotNull(null)).toBeFalsy();
  expect(isNotNull(undefined)).toBeFalsy();
});

it('assertNotNull tests', () => {
  assertNotNull(2);
  assertNotNull('2');
  assertNotNull([3]);
  expect(() => assertNotNull(null)).toThrow();
  expect(() => assertNotNull(undefined)).toThrow();
});
