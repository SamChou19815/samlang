export const MIN_I32_VALUE = BigInt(-2147483648);
export const MAX_I32_VALUE = BigInt(2147483647);

export const bigIntIsWithin32BitIntegerRange = (value: bigint): boolean =>
  value >= MIN_I32_VALUE && value <= MAX_I32_VALUE;
