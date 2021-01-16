import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import patternBuilder from './parser-pattern-builder';
import type TypeBuilder from './parser-type-builder';
import { contextRange } from './parser-util';

import { UndecidedTypes } from 'samlang-core-ast/common-nodes';
import type {
  SamlangValStatement,
  StatementBlock,
  SamlangExpression,
} from 'samlang-core-ast/samlang-expressions';
import type {
  ExpressionContext,
  StatementBlockContext,
  ValStatementContext,
} from 'samlang-core-parser-generated/PLParser';
import type { PLVisitor } from 'samlang-core-parser-generated/PLVisitor';
import { isNotNull, checkNotNull } from 'samlang-core-utils';

class StatementBuilder
  extends AbstractParseTreeVisitor<SamlangValStatement | null>
  implements PLVisitor<SamlangValStatement | null> {
  constructor(
    private readonly expressionBuilder: (context: ExpressionContext) => SamlangExpression | null,
    private readonly typeBuilder: TypeBuilder
  ) {
    super();
  }

  // istanbul ignore next
  defaultResult = (): SamlangValStatement | null => null;

  visitValStatement = (ctx: ValStatementContext): SamlangValStatement | null => {
    const expressionContext = ctx.expression();
    const assignedExpression = checkNotNull(this.expressionBuilder(expressionContext));

    const patternContext = ctx.pattern();
    const pattern = patternContext.accept(patternBuilder) ?? {
      type: 'WildCardPattern',
      range: contextRange(patternContext),
    };
    const typeAnnotation =
      ctx.typeAnnotation()?.typeExpr()?.accept(this.typeBuilder) ?? UndecidedTypes.next();

    return { range: contextRange(ctx), pattern, typeAnnotation, assignedExpression };
  };
}

export default class StatementBlockBuilder
  extends AbstractParseTreeVisitor<StatementBlock | null>
  implements PLVisitor<StatementBlock | null> {
  private readonly statementBuilder: StatementBuilder;

  constructor(
    private readonly expressionBuilder: (context: ExpressionContext) => SamlangExpression,
    typeBuilder: TypeBuilder
  ) {
    super();
    this.statementBuilder = new StatementBuilder(expressionBuilder, typeBuilder);
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
