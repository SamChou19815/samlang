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
  TsPattern,
  TsTuplePattern,
  TsObjectPattern,
  TsObjectDestructedName,
  TsVariablePattern,
  TsWildCardPattern,
} from './ast';
import { tokenRange, contextRange, throwParserError } from './parser-util';

class FieldNameBuilder extends AbstractParseTreeVisitor<TsObjectDestructedName>
  implements PLVisitor<TsObjectDestructedName> {
  defaultResult = (): TsObjectDestructedName => null!;

  visitRawVar = (ctx: RawVarContext): TsObjectDestructedName => {
    const symbol = ctx.LowerId().symbol;
    const fieldName = symbol.text ?? throwParserError('Missing field name in object pattern.');
    return { fieldName, fieldOrder: -1, range: tokenRange(symbol) };
  };

  visitRenamedVar = (ctx: RenamedVarContext): TsObjectDestructedName => {
    const idList = ctx.LowerId();
    const fieldName =
      idList[0].symbol.text ?? throwParserError('Missing field name in object pattern.');
    const alias = idList[1].symbol.text ?? throwParserError('Missing alias in object pattern.');
    return {
      fieldName,
      fieldOrder: -1,
      alias,
      range: contextRange(ctx),
    };
  };
}

const fieldNameBuilder = new FieldNameBuilder();

class PatternBuilder extends AbstractParseTreeVisitor<TsPattern> implements PLVisitor<TsPattern> {
  defaultResult = (): TsPattern => null!;

  visitTuplePattern = (ctx: TuplePatternContext): TsPattern =>
    new TsTuplePattern(
      contextRange(ctx),
      ctx.varOrWildCard().map((c) => ({ name: c.LowerId()?.symbol?.text, range: contextRange(c) }))
    );

  visitObjectPattern = (ctx: ObjectPatternContext): TsPattern => {
    const destructedNames = ctx.varOrRenamedVar().map((it) => it.accept(fieldNameBuilder));
    return new TsObjectPattern(contextRange(ctx), destructedNames);
  };

  visitVariablePattern = (ctx: VariablePatternContext): TsPattern =>
    new TsVariablePattern(contextRange(ctx), ctx.text);

  visitWildcardPattern = (ctx: WildcardPatternContext): TsPattern =>
    new TsWildCardPattern(contextRange(ctx));
}

const patternBuilder = new PatternBuilder();
export default patternBuilder;
