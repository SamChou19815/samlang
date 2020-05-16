import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  TuplePatternContext,
  ObjectPatternContext,
  RawVarContext,
  RenamedVarContext,
  VariablePatternContext,
  WildcardPatternContext,
} from './generated/PLParser';
import {
  Pattern,
  TuplePattern,
  ObjectPattern,
  ObjectDestructedName,
  VariablePattern,
  WildCardPattern,
} from './ast';
import { tokenRange, contextRange, throwParserError } from './parser-util';

class FieldNameBuilder extends AbstractParseTreeVisitor<ObjectDestructedName>
  implements PLVisitor<ObjectDestructedName> {
  defaultResult = (): ObjectDestructedName => throwParserError();

  visitRawVar = (ctx: RawVarContext): ObjectDestructedName => {
    const symbol = ctx.LowerId().symbol;
    const fieldName = symbol.text ?? throwParserError();
    return { fieldName, fieldOrder: -1, range: tokenRange(symbol) };
  };

  visitRenamedVar = (ctx: RenamedVarContext): ObjectDestructedName => {
    const idList = ctx.LowerId();
    const fieldName = idList[0].symbol.text ?? throwParserError();
    const alias = idList[1].symbol.text ?? throwParserError();
    return {
      fieldName,
      fieldOrder: -1,
      alias,
      range: contextRange(ctx),
    };
  };
}

const fieldNameBuilder = new FieldNameBuilder();

class PatternBuilder extends AbstractParseTreeVisitor<Pattern> implements PLVisitor<Pattern> {
  defaultResult = (): Pattern => throwParserError();

  visitTuplePattern = (ctx: TuplePatternContext): Pattern =>
    new TuplePattern(
      contextRange(ctx),
      ctx.varOrWildCard().map((c) => ({ name: c.LowerId()?.symbol?.text, range: contextRange(c) }))
    );

  visitObjectPattern = (ctx: ObjectPatternContext): Pattern => {
    const destructedNames = ctx.varOrRenamedVar().map((it) => it.accept(fieldNameBuilder));
    return new ObjectPattern(contextRange(ctx), destructedNames);
  };

  visitVariablePattern = (ctx: VariablePatternContext): Pattern =>
    new VariablePattern(contextRange(ctx), ctx.text);

  visitWildcardPattern = (ctx: WildcardPatternContext): Pattern =>
    new WildCardPattern(contextRange(ctx));
}

const patternBuilder = new PatternBuilder();
export default patternBuilder;
