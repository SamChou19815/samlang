import { Token, ParserRuleContext } from 'antlr4ts';
import { Position, Range } from './ast';

export const tokenStartPosition = (token: Token): Position => ({
  line: token.line - 1,
  column: token.charPositionInLine,
});

export const tokenEndPosition = (token: Token): Position => ({
  line: token.line - 1,
  column: token.charPositionInLine + (token.text?.length ?? 0),
});

export const tokenRange = (token: Token): Range => ({
  start: tokenStartPosition(token),
  end: tokenEndPosition(token),
});

export const contextRange = (context: ParserRuleContext): Range => {
  const start = tokenStartPosition(context.start);
  const stop = context.stop;
  if (stop == null) {
    return { start, end: start };
  }
  return { start, end: tokenEndPosition(stop) };
};

const positionCompare = (p1: Position, p2: Position): number => {
  const c = p1.line - p2.line;
  return c != 0 ? c : p1.column - p2.column;
};
export const rangeUnion = (r1: Range, r2: Range): Range => {
  const startSorted = [r1.start, r2.start].sort(positionCompare);
  const endSorted = [r1.end, r2.end].sort(positionCompare);
  return { start: startSorted[0], end: endSorted[1] };
};

export const throwParserError = (): never => {
  throw new Error('SyntaxError: The program has syntax errors.');
};
