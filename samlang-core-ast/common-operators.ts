export type BinaryOperator =
  | { readonly symbol: '*'; readonly precedence: 0 }
  | { readonly symbol: '/'; readonly precedence: 0 }
  | { readonly symbol: '%'; readonly precedence: 0 }
  | { readonly symbol: '+'; readonly precedence: 1 }
  | { readonly symbol: '-'; readonly precedence: 1 }
  | { readonly symbol: '<'; readonly precedence: 2 }
  | { readonly symbol: '<='; readonly precedence: 2 }
  | { readonly symbol: '>'; readonly precedence: 2 }
  | { readonly symbol: '>='; readonly precedence: 2 }
  | { readonly symbol: '=='; readonly precedence: 2 }
  | { readonly symbol: '!='; readonly precedence: 2 }
  | { readonly symbol: '&&'; readonly precedence: 3 }
  | { readonly symbol: '||'; readonly precedence: 4 }
  | { readonly symbol: '::'; readonly precedence: 5 };

export const MUL: BinaryOperator = { symbol: '*', precedence: 0 };
export const DIV: BinaryOperator = { symbol: '/', precedence: 0 };
export const MOD: BinaryOperator = { symbol: '%', precedence: 0 };
export const PLUS: BinaryOperator = { symbol: '+', precedence: 1 };
export const MINUS: BinaryOperator = { symbol: '-', precedence: 1 };
export const LT: BinaryOperator = { symbol: '<', precedence: 2 };
export const LE: BinaryOperator = { symbol: '<=', precedence: 2 };
export const GT: BinaryOperator = { symbol: '>', precedence: 2 };
export const GE: BinaryOperator = { symbol: '>=', precedence: 2 };
export const EQ: BinaryOperator = { symbol: '==', precedence: 2 };
export const NE: BinaryOperator = { symbol: '!=', precedence: 2 };
export const AND: BinaryOperator = { symbol: '&&', precedence: 3 };
export const OR: BinaryOperator = { symbol: '||', precedence: 4 };
export const CONCAT: BinaryOperator = { symbol: '::', precedence: 5 };

export const binaryOperatorValues: readonly BinaryOperator[] = [
  MUL,
  DIV,
  MOD,
  PLUS,
  MINUS,
  LT,
  LE,
  GT,
  GE,
  EQ,
  NE,
  AND,
  OR,
  CONCAT,
];

export const binaryOperatorSymbolTable: Record<
  string,
  BinaryOperator | undefined
> = Object.fromEntries(
  binaryOperatorValues.map((operator) => [operator.symbol, operator] as const)
);

export type IROperator = '+' | '-' | '*' | '/' | '%' | '^' | '<' | '>' | '<=' | '>=' | '==' | '!=';
