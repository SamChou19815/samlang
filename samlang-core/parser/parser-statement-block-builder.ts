import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import { UndecidedTypes } from '../ast/common-nodes';
import type {
  SamlangValStatement,
  StatementBlock,
  SamlangExpression,
} from '../ast/samlang-expressions';
import { isNotNull, assertNotNull } from '../util/type-assertions';
import type {
  ExpressionContext,
  StatementBlockContext,
  ValStatementContext,
} from './generated/PLParser';
import type { PLVisitor } from './generated/PLVisitor';
import patternBuilder from './parser-pattern-builder';
import typeBuilder from './parser-type-builder';
import { contextRange } from './parser-util';

class StatementBuilder
  extends AbstractParseTreeVisitor<SamlangValStatement | null>
  implements PLVisitor<SamlangValStatement | null> {
  constructor(
    private readonly expressionBuilder: (context: ExpressionContext) => SamlangExpression | null
  ) {
    super();
  }

  // istanbul ignore next
  defaultResult = (): SamlangValStatement | null => null;

  visitValStatement = (ctx: ValStatementContext): SamlangValStatement | null => {
    const expressionContext = ctx.expression();
    const assignedExpression = this.expressionBuilder(expressionContext);
    assertNotNull(assignedExpression);

    const patternContext = ctx.pattern();
    const pattern = patternContext.accept(patternBuilder) ?? {
      type: 'WildCardPattern',
      range: contextRange(patternContext),
    };
    const typeAnnotation =
      ctx.typeAnnotation()?.typeExpr()?.accept(typeBuilder) ?? UndecidedTypes.next();

    return { range: contextRange(ctx), pattern, typeAnnotation, assignedExpression };
  };
}

export default class StatementBlockBuilder
  extends AbstractParseTreeVisitor<StatementBlock | null>
  implements PLVisitor<StatementBlock | null> {
  private readonly statementBuilder: StatementBuilder;

  constructor(
    private readonly expressionBuilder: (context: ExpressionContext) => SamlangExpression
  ) {
    super();
    this.statementBuilder = new StatementBuilder(expressionBuilder);
  }

  // istanbul ignore next
  defaultResult = (): StatementBlock | null => null;

  visitStatementBlock = (ctx: StatementBlockContext): StatementBlock => {
    const expressionContext = ctx.expression();
    const expression =
      expressionContext != null ? this.expressionBuilder(expressionContext) : undefined;
    return {
      range: contextRange(ctx),
      statements: ctx
        .statement()
        .map((it) => it.accept(this.statementBuilder))
        .filter(isNotNull),
      expression,
    };
  };
}
