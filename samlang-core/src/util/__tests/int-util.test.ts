import {
  MIN_I32_VALUE,
  MAX_I32_VALUE,
  bigIntIsWithin32BitIntegerRange,
  logTwo,
  isPowerOfTwo,
} from '../int-util';

it('bigIntIsWithin32BitIntegerRange test', () => {
  expect(bigIntIsWithin32BitIntegerRange(BigInt(-21474836480))).toBeFalsy();
  expect(bigIntIsWithin32BitIntegerRange(MIN_I32_VALUE)).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(BigInt(0))).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(MAX_I32_VALUE)).toBeTruthy();
  expect(bigIntIsWithin32BitIntegerRange(BigInt(21474836470))).toBeFalsy();
});

it('logTwo, isPowerOfTwo test', () => {
  expect(isPowerOfTwo(BigInt(0))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(1))).toBeTruthy();
  expect(isPowerOfTwo(BigInt(2))).toBeTruthy();
  expect(isPowerOfTwo(BigInt(3))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(4))).toBeTruthy();
  expect(isPowerOfTwo(BigInt(5))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(6))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(7))).toBeFalsy();
  expect(isPowerOfTwo(BigInt(8))).toBeTruthy();

  expect(logTwo(BigInt(1))).toBe(0);
  expect(logTwo(BigInt(2))).toBe(1);
  expect(logTwo(BigInt(4))).toBe(2);
  expect(logTwo(BigInt(8))).toBe(3);
  expect(logTwo(BigInt(16))).toBe(4);
  expect(logTwo(BigInt(65536))).toBe(16);
});
