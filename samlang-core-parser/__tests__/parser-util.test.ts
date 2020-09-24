import { contextRange } from '../parser-util';

import { TupleTypeContext, TypeExprContext } from 'samlang-core-parser-generated/PLParser';

it('nullable context/token field test', () => {
  const dummyContext = new TupleTypeContext(new TypeExprContext(undefined, 0));
  dummyContext._start = {
    text: undefined,
    type: 0,
    line: 0,
    charPositionInLine: 0,
    channel: 0,
    tokenIndex: 0,
    startIndex: 0,
    stopIndex: 0,
    tokenSource: undefined,
    inputStream: undefined,
  };
  contextRange(dummyContext);
  dummyContext._stop = dummyContext._start;
  contextRange(dummyContext);
});
