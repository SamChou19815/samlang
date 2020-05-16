import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  ExpressionContext,
  StatementBlockContext,
  ValStatementContext,
} from './generated/PLParser';
import { UndecidedType, Expression, StatementBlock, ValStatement, WildCardPattern } from './ast';
import { contextRange, throwParserError } from './parser-util';
import typeBuilder from './type-builder';
import patternBuilder from './pattern-builder';

class StatementBuilder extends AbstractParseTreeVisitor<ValStatement>
  implements PLVisitor<ValStatement> {
  constructor(private readonly expressionBuilder: (context: ExpressionContext) => Expression) {
    super();
  }

  defaultResult = (): ValStatement => throwParserError();

  visitValStatement = (ctx: ValStatementContext): ValStatement => {
    const patternContext = ctx.pattern() ?? throwParserError();
    const pattern =
      patternContext.accept(patternBuilder) ?? new WildCardPattern(contextRange(patternContext));
    const typeAnnotation =
      ctx.typeAnnotation()?.typeExpr()?.accept(typeBuilder) ?? new UndecidedType();
    const expressionContext = ctx.expression() ?? throwParserError();
    const expression = this.expressionBuilder(expressionContext) ?? throwParserError();
    return new ValStatement(contextRange(ctx), pattern, typeAnnotation, expression);
  };
}

export default class StatementBlockBuilder extends AbstractParseTreeVisitor<StatementBlock>
  implements PLVisitor<StatementBlock> {
  private readonly statementBuilder: StatementBuilder;

  constructor(private readonly expressionBuilder: (context: ExpressionContext) => Expression) {
    super();
    this.statementBuilder = new StatementBuilder(expressionBuilder);
  }

  defaultResult = (): StatementBlock => throwParserError();

  visitStatementBlock = (ctx: StatementBlockContext): StatementBlock => {
    const expressionContext = ctx.expression() ?? throwParserError();
    const expression = this.expressionBuilder(expressionContext) ?? throwParserError();
    return new StatementBlock(
      contextRange(ctx),
      ctx.statement().map((it) => it.accept(this.statementBuilder)),
      expression
    );
  };
}
