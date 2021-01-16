import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import { tokenRange, contextRange } from './parser-util';

import { UndecidedTypes } from 'samlang-core-ast/common-nodes';
import type {
  Pattern,
  TuplePattern,
  ObjectPattern,
  ObjectPatternDestucturedName,
  VariablePattern,
  WildCardPattern,
} from 'samlang-core-ast/samlang-pattern';
import type {
  TuplePatternContext,
  ObjectPatternContext,
  RawVarContext,
  RenamedVarContext,
  VariablePatternContext,
  WildcardPatternContext,
} from 'samlang-core-parser-generated/PLParser';
import type { PLVisitor } from 'samlang-core-parser-generated/PLVisitor';
import { isNotNull, checkNotNull } from 'samlang-core-utils';

class FieldNameBuilder
  extends AbstractParseTreeVisitor<ObjectPatternDestucturedName | null>
  implements PLVisitor<ObjectPatternDestucturedName | null> {
  // istanbul ignore next
  defaultResult = (): ObjectPatternDestucturedName | null => null;

  visitRawVar = (ctx: RawVarContext): ObjectPatternDestucturedName | null => {
    const symbol = ctx.LowerId().symbol;
    const fieldName = checkNotNull(symbol.text);
    return { fieldName, fieldOrder: -1, type: UndecidedTypes.next(), range: tokenRange(symbol) };
  };

  visitRenamedVar = (ctx: RenamedVarContext): ObjectPatternDestucturedName | null => {
    const idList = ctx.LowerId();
    const fieldName = checkNotNull(idList[0]?.symbol.text);
    const alias = checkNotNull(idList[1]?.symbol.text);
    return {
      fieldName,
      fieldOrder: -1,
      type: UndecidedTypes.next(),
      alias,
      range: contextRange(ctx),
    };
  };
}

const fieldNameBuilder = new FieldNameBuilder();

class PatternBuilder
  extends AbstractParseTreeVisitor<Pattern | null>
  implements PLVisitor<Pattern | null> {
  defaultResult = (): Pattern | null => null;

  visitTuplePattern = (ctx: TuplePatternContext): TuplePattern => ({
    type: 'TuplePattern',
    range: contextRange(ctx),
    destructedNames: ctx.varOrWildCard().map((c) => ({
      name: c.LowerId()?.symbol?.text,
      type: UndecidedTypes.next(),
      range: contextRange(c),
    })),
  });

  visitObjectPattern = (ctx: ObjectPatternContext): ObjectPattern => ({
    type: 'ObjectPattern',
    range: contextRange(ctx),
    destructedNames: ctx
      .varOrRenamedVar()
      .map((it) => it.accept(fieldNameBuilder))
      .filter(isNotNull),
  });

  visitVariablePattern = (ctx: VariablePatternContext): VariablePattern => ({
    type: 'VariablePattern',
    range: contextRange(ctx),
    name: ctx.text,
  });

  visitWildcardPattern = (ctx: WildcardPatternContext): WildCardPattern => ({
    type: 'WildCardPattern',
    range: contextRange(ctx),
  });
}

const patternBuilder = new PatternBuilder();
export default patternBuilder;
