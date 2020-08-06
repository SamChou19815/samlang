import { MIN_I32_VALUE, MAX_I32_VALUE, bigIntIsWithin32BitIntegerRange } from '../int-util';

it('bigIntIsWithin32BitIntegerRange test', () => {
  expect(bigIntIsWithin32BitIntegerRange(BigInt(-21474836480))).toBeFalsy();
  expect(bigIntIsWithin32BitIntegerRange(MIN_I32_VALUE)).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(BigInt(0))).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(MAX_I32_VALUE)).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(BigInt(21474836470))).toBeFalsy();
});
