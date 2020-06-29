/** A collection of all supported literals. */

/** A boolean literal, like `true` or `false`.  */
export type BoolLiteral = { readonly type: 'BoolLiteral'; readonly value: boolean };
/** An int literal, like 42. */
export type IntLiteral = { readonly type: 'IntLiteral'; readonly value: bigint };

/** A string literal, like `"Answer to life, universe, and everything"`. */
export type StringLiteral = { readonly type: 'StringLiteral'; readonly value: string };
export type Literal = IntLiteral | StringLiteral | BoolLiteral;

export const TRUE: BoolLiteral = { type: 'BoolLiteral', value: true };
export const FALSE: BoolLiteral = { type: 'BoolLiteral', value: false };

export const intLiteralOf = (value: bigint): IntLiteral => ({
  type: 'IntLiteral',
  value,
});
export const stringLiteralOf = (value: string): StringLiteral => ({
  type: 'StringLiteral',
  value,
});

export const prettyPrintLiteral = (literal: Literal): string => {
  switch (literal.type) {
    case 'BoolLiteral':
    case 'IntLiteral':
      return String(literal.value);
    case 'StringLiteral':
      return `"${literal.value}"`;
  }
};
