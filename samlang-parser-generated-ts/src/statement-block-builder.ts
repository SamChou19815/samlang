import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  ExpressionContext,
  StatementBlockContext,
  ValStatementContext,
} from './generated/PLParser';
import {
  TsUndecidedType,
  TsExpression,
  TsStatementBlock,
  TsValStatement,
  TsWildCardPattern,
} from './ast';
import { contextRange, throwParserError } from './parser-util';
import typeBuilder from './type-builder';
import patternBuilder from './pattern-builder';

class StatementBuilder extends AbstractParseTreeVisitor<TsValStatement>
  implements PLVisitor<TsValStatement> {
  constructor(private readonly expressionBuilder: (context: ExpressionContext) => TsExpression) {
    super();
  }

  defaultResult = (): TsValStatement => throwParserError();

  visitValStatement = (ctx: ValStatementContext): TsValStatement => {
    const patternContext = ctx.pattern() ?? throwParserError('Missing pattern in val statement.');
    const pattern =
      patternContext.accept(patternBuilder) ?? new TsWildCardPattern(contextRange(patternContext));
    const typeAnnotation =
      ctx.typeAnnotation()?.typeExpr()?.accept(typeBuilder) ?? new TsUndecidedType();
    const expressionContext =
      ctx.expression() ?? throwParserError('Missing expression in val statement.');
    const expression = this.expressionBuilder(expressionContext) ?? throwParserError();
    return new TsValStatement(contextRange(ctx), pattern, typeAnnotation, expression);
  };
}

export default class StatementBlockBuilder extends AbstractParseTreeVisitor<TsStatementBlock>
  implements PLVisitor<TsStatementBlock> {
  private readonly statementBuilder: StatementBuilder;

  constructor(private readonly expressionBuilder: (context: ExpressionContext) => TsExpression) {
    super();
    this.statementBuilder = new StatementBuilder(expressionBuilder);
  }

  defaultResult = (): TsStatementBlock => throwParserError();

  visitStatementBlock = (ctx: StatementBlockContext): TsStatementBlock => {
    const expressionContext = ctx.expression();
    const expression =
      expressionContext != null ? this.expressionBuilder(expressionContext) : undefined;
    return new TsStatementBlock(
      contextRange(ctx),
      ctx.statement().map((it) => it.accept(this.statementBuilder)),
      expression
    );
  };
}
