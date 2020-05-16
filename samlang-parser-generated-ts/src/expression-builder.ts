import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  ExpressionContext,
  NestedExprContext,
  LiteralExprContext,
  ThisExprContext,
  VariableExprContext,
  ClassMemberExprContext,
  TupleConstructorContext,
  NormalObjFieldDeclarationContext,
  ShorthandObjFieldDeclarationContext,
  ObjConstructorContext,
  VariantConstructorContext,
  FieldAccessExprContext,
  NotExprContext,
  NegExprContext,
  PanicExprContext,
  StringToIntExprContext,
  IntToStringExprContext,
  PrintLineExprContext,
  FunctionApplicationExprContext,
  FactorExprContext,
  TermExprContext,
  ComparisonExprContext,
  ConjunctionExprContext,
  ConcatExprContext,
  DisjunctionExprContext,
  IfElseExprContext,
  MatchExprContext,
  FunExprContext,
  StatementBlockExprContext,
} from './generated/PLParser';
import {
  TsPrimitiveType,
  TsTupleType,
  TsFunctionType,
  TsUndecidedType,
  TsLiteral,
  TsExpression,
  TsLiteralExpression,
  TsThisExpression,
  TsVariableExpression,
  TsClassMemberExpression,
  TsTupleConstructorExpression,
  TsFieldConstructor,
  TsObjectConstructorExpression,
  TsVariantConstructorExpression,
  TsFieldAccessExpression,
  TsUnaryExpression,
  TsPanicExpression,
  TsBuiltInFunctionCallExpression,
  TsFunctionApplicationExpression,
  TsBinaryExpression,
  BinaryOperator,
  TsIfElseExpression,
  TsMatchExpression,
  TsLambdaExpression,
  TsStatementBlockExpression,
} from './ast';
import StatementBlockBuilder from './statement-block-builder';
import { tokenRange, contextRange, throwParserError } from './parser-util';
import typeBuilder from './type-builder';

const unescapeQuotes = (source: string): string => source.replace(/\\"/g, '"');

class ObjectFieldDeclarationBuilder extends AbstractParseTreeVisitor<TsFieldConstructor>
  implements PLVisitor<TsFieldConstructor> {
  constructor(private readonly toExpression: (context: ExpressionContext) => TsExpression) {
    super();
  }

  defaultResult = (): TsFieldConstructor => throwParserError();

  visitNormalObjFieldDeclaration = (ctx: NormalObjFieldDeclarationContext): TsFieldConstructor => {
    const nameNode = ctx.LowerId().symbol;
    return {
      range: tokenRange(nameNode),
      type: new TsUndecidedType(),
      name: nameNode.text ?? throwParserError(),
      expression: this.toExpression(ctx.expression())
    };
  };

  visitShorthandObjFieldDeclaration = (
    ctx: ShorthandObjFieldDeclarationContext
  ): TsFieldConstructor => {
    const nameNode = ctx.LowerId().symbol;
    return {
      range: tokenRange(nameNode),
      type: new TsUndecidedType(),
      name: nameNode.text ?? throwParserError()
    };
  };
}

class ExpressionBuilder extends AbstractParseTreeVisitor<TsExpression>
  implements PLVisitor<TsExpression> {
  private toExpression = (context: ExpressionContext): TsExpression => context.accept(this);
  private statementBlockBuilder: StatementBlockBuilder = new StatementBlockBuilder(
    this.toExpression
  );
  private objectFieldDeclarationBuilder: ObjectFieldDeclarationBuilder = new ObjectFieldDeclarationBuilder(
    this.toExpression
  );

  defaultResult = (): TsExpression => throwParserError();

  visitNestedExpr = (ctx: NestedExprContext): TsExpression => ctx.expression().accept(this);

  visitLiteralExpr(ctx: LiteralExprContext): TsExpression {
    const literalNode = ctx.literal();
    const range = contextRange(literalNode);
    if (literalNode.TRUE() != null) {
      return new TsLiteralExpression(range, new TsPrimitiveType('bool'), new TsLiteral('bool', 'true'));
    }
    if (literalNode.FALSE() != null) {
      return new TsLiteralExpression(range, new TsPrimitiveType('bool'), new TsLiteral('bool', 'false'));
    }
    if (literalNode.MinInt() != null) {
      return new TsLiteralExpression(
        range,
        new TsPrimitiveType('int'),
        new TsLiteral('int', '9223372036854775808')
      );
    }
    const intLiteralNode = literalNode.IntLiteral();
    if (intLiteralNode != null) {
      const text = intLiteralNode.text ?? throwParserError();
      return new TsLiteralExpression(range, new TsPrimitiveType('int'), new TsLiteral('int', text));
    }
    const stringLiteralNode = literalNode.StrLiteral();
    if (stringLiteralNode != null) {
      const literalText = stringLiteralNode.text;
      const unescaped = unescapeQuotes(literalText.substring(1, literalText.length - 1));
      return new TsLiteralExpression(
        range,
        new TsPrimitiveType('string'),
        new TsLiteral('string', unescaped)
      );
    }
    throw new Error('SyntaxError: Bad literal!');
  }

  visitThisExpr = (ctx: ThisExprContext): TsExpression =>
    new TsThisExpression(tokenRange(ctx.THIS().symbol), new TsUndecidedType());

  visitVariableExpr = (ctx: VariableExprContext): TsExpression =>
    new TsVariableExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx.LowerId().symbol.text ?? throwParserError()
    );

  visitClassMemberExpr = (ctx: ClassMemberExprContext): TsExpression =>
    new TsClassMemberExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      [],
      ctx.UpperId().symbol.text ?? throwParserError(),
      tokenRange(ctx.UpperId().symbol),
      ctx.LowerId().symbol.text ?? throwParserError()
    );

  visitTupleConstructor(ctx: TupleConstructorContext): TsExpression {
    const range = contextRange(ctx);
    const expressionList = ctx.expression().map(this.toExpression);
    if (expressionList.length > 22) {
      throwParserError();
    }
    const type = new TsTupleType(expressionList.map((it) => it.type));
    return new TsTupleConstructorExpression(range, type, expressionList);
  }

  visitObjConstructor(ctx: ObjConstructorContext): TsExpression {
    return new TsObjectConstructorExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx
        .objectFieldDeclarations()
        .objectFieldDeclaration()
        .map((it) => it.accept(this.objectFieldDeclarationBuilder))
    );
  }

  visitVariantConstructor = (ctx: VariantConstructorContext): TsExpression =>
    new TsVariantConstructorExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx.UpperId().symbol.text ?? throwParserError(),
      -1,
      ctx.expression().accept(this)
    );

  visitFieldAccessExpr = (ctx: FieldAccessExprContext): TsExpression =>
    new TsFieldAccessExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx.expression().accept(this),
      ctx.LowerId().symbol.text ?? throwParserError(),
      -1
    );

  visitNotExpr = (ctx: NotExprContext): TsExpression =>
    new TsUnaryExpression(
      contextRange(ctx),
      new TsPrimitiveType('bool'),
      '!',
      ctx.expression().accept(this)
    );

  visitNegExpr = (ctx: NegExprContext): TsExpression =>
    new TsUnaryExpression(
      contextRange(ctx),
      new TsPrimitiveType('int'),
      '-',
      ctx.expression().accept(this)
    );

  visitPanicExpr = (ctx: PanicExprContext): TsExpression =>
    new TsPanicExpression(contextRange(ctx), new TsUndecidedType(), ctx.expression().accept(this));

  visitStringToIntExpr = (ctx: StringToIntExprContext): TsExpression =>
    new TsBuiltInFunctionCallExpression(
      contextRange(ctx),
      new TsPrimitiveType('int'),
      'stringToInt',
      ctx.expression().accept(this)
    );

  visitIntToStringExpr = (ctx: IntToStringExprContext): TsExpression =>
    new TsBuiltInFunctionCallExpression(
      contextRange(ctx),
      new TsPrimitiveType('string'),
      'intToString',
      ctx.expression().accept(this)
    );

  visitPrintLineExpr = (ctx: PrintLineExprContext): TsExpression =>
    new TsBuiltInFunctionCallExpression(
      contextRange(ctx),
      new TsPrimitiveType('unit'),
      'println',
      ctx.expression().accept(this)
    );

  visitFunctionApplicationExpr = (ctx: FunctionApplicationExprContext): TsExpression =>
    new TsFunctionApplicationExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx.expression().accept(this),
      ctx.functionArguments().expression().map(this.toExpression)
    );

  visitFactorExpr = (ctx: FactorExprContext): TsExpression => {
    const operator = ctx.factorOperator().text as BinaryOperator;
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new TsBinaryExpression(contextRange(ctx), new TsPrimitiveType('int'), e1, operator, e2);
  };

  visitTermExpr = (ctx: TermExprContext): TsExpression => {
    const operator = ctx.termOperator().text as BinaryOperator;
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new TsBinaryExpression(contextRange(ctx), new TsPrimitiveType('int'), e1, operator, e2);
  };

  visitComparisonExpr = (ctx: ComparisonExprContext): TsExpression => {
    const operator = ctx.comparisonOperator().text as BinaryOperator;
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new TsBinaryExpression(contextRange(ctx), new TsPrimitiveType('bool'), e1, operator, e2);
  };

  visitConjunctionExpr = (ctx: ConjunctionExprContext): TsExpression => {
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new TsBinaryExpression(contextRange(ctx), new TsPrimitiveType('bool'), e1, '&&', e2);
  };

  visitConcatExpr = (ctx: ConcatExprContext): TsExpression => {
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new TsBinaryExpression(contextRange(ctx), new TsPrimitiveType('string'), e1, '::', e2);
  };

  visitDisjunctionExpr = (ctx: DisjunctionExprContext): TsExpression => {
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new TsBinaryExpression(contextRange(ctx), new TsPrimitiveType('bool'), e1, '||', e2);
  };

  visitIfElseExpr = (ctx: IfElseExprContext): TsExpression => {
    const boolExpression = ctx.expression(0).accept(this);
    const e1 = ctx.expression(1).accept(this);
    const e2 = ctx.expression(2).accept(this);
    return new TsIfElseExpression(contextRange(ctx), new TsUndecidedType(), boolExpression, e1, e2);
  };

  visitMatchExpr = (ctx: MatchExprContext): TsExpression =>
    new TsMatchExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx.expression().accept(this),
      ctx.patternToExpr().map((pattern2Expr) => ({
        range: contextRange(pattern2Expr),
        tag: pattern2Expr.UpperId()?.symbol?.text ?? throwParserError(),
        tagOrder: -1,
        dataVariable: pattern2Expr.varOrWildCard()?.LowerId()?.symbol?.text,
        expression: pattern2Expr.expression().accept(this),
      }))
    );

  visitFunExpr = (ctx: FunExprContext): TsExpression => {
    const functionArguments = ctx.optionallyAnnotatedParameter().map((oneArg) => {
      const nameNode = oneArg.LowerId().symbol;
      const name = nameNode.text ?? throwParserError();
      const type = oneArg.typeAnnotation()?.typeExpr()?.accept(typeBuilder) ?? new TsUndecidedType();
      return { name, type };
    });
    if (functionArguments.length > 22) {
      throwParserError();
    }
    return new TsLambdaExpression(
      contextRange(ctx),
      new TsFunctionType(
        functionArguments.map((it) => it.type),
        new TsUndecidedType()
      ),
      functionArguments,
      ctx.expression().accept(this)
    );
  };

  visitStatementBlockExpr = (ctx: StatementBlockExprContext): TsExpression =>
    new TsStatementBlockExpression(
      contextRange(ctx),
      new TsUndecidedType(),
      ctx.statementBlock().accept(this.statementBlockBuilder)
    );
}

const expressionBuilder = new ExpressionBuilder();
export default expressionBuilder;
