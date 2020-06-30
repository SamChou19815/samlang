import { Token, ParserRuleContext } from 'antlr4ts';

import Position from '../ast/common/position';
import Range from '../ast/common/range';

export const tokenStartPosition = (token: Token): Position =>
  new Position(token.line - 1, token.charPositionInLine);

export const tokenEndPosition = (token: Token): Position =>
  new Position(token.line - 1, token.charPositionInLine + (token.text?.length ?? 0));

export const tokenRange = (token: Token): Range =>
  new Range(tokenStartPosition(token), tokenEndPosition(token));

export const contextRange = (context: ParserRuleContext): Range => {
  const start = tokenStartPosition(context.start);
  const stop = context.stop;
  if (stop == null) {
    return new Range(start, start);
  }
  return new Range(start, tokenEndPosition(stop));
};
