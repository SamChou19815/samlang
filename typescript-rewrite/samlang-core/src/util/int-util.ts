export const MIN_I32_VALUE = BigInt(-2147483648);
export const MAX_I32_VALUE = BigInt(2147483647);
export const BIGINT_ONE = BigInt(1);

export const bigIntIsWithin32BitIntegerRange = (value: bigint): boolean =>
  value >= MIN_I32_VALUE && value <= MAX_I32_VALUE;

export const logTwo = (number: bigint): number =>
  number === BIGINT_ONE ? 0 : 1 + logTwo(number / BigInt(2));

export const isPowerOfTwo = (number: bigint): boolean =>
  // eslint-disable-next-line no-bitwise
  number > 0 && (number & (number - BIGINT_ONE)) === BigInt(0);
