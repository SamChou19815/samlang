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
  PrimitiveType,
  TupleType,
  FunctionType,
  UndecidedType,
  IntLiteral,
  BoolLiteral,
  StringLiteral,
  Expression,
  LiteralExpression,
  ThisExpression,
  VariableExpression,
  ClassMemberExpression,
  TupleConstructorExpression,
  FieldConstructor,
  FieldAsFieldConstructor,
  FieldShorthandAsFieldConstructor,
  ObjectConstructorExpression,
  VariantConstructorExpression,
  FieldAccessExpression,
  UnaryExpression,
  PanicExpression,
  BuiltInFunctionCallExpression,
  FunctionApplicationExpression,
  BinaryExpression,
  BinaryOperator,
  IfElseExpression,
  MatchExpression,
  LambdaExpression,
  StatementBlockExpression,
} from './ast';
import StatementBlockBuilder from './statement-block-builder';
import { tokenRange, contextRange, throwParserError } from './parser-util';
import typeBuilder from './type-builder';

const unescapeQuotes = (source: string): string => source.replace(/\\"/g, '"');

class ObjectFieldDeclarationBuilder extends AbstractParseTreeVisitor<FieldConstructor>
  implements PLVisitor<FieldConstructor> {
  constructor(private readonly toExpression: (context: ExpressionContext) => Expression) {
    super();
  }

  defaultResult = (): FieldConstructor => throwParserError();

  visitNormalObjFieldDeclaration = (ctx: NormalObjFieldDeclarationContext): FieldConstructor => {
    const nameNode = ctx.LowerId().symbol;
    return new FieldAsFieldConstructor(
      tokenRange(nameNode),
      new UndecidedType(),
      nameNode.text ?? throwParserError(),
      this.toExpression(ctx.expression())
    );
  };

  visitShorthandObjFieldDeclaration = (
    ctx: ShorthandObjFieldDeclarationContext
  ): FieldConstructor => {
    const nameNode = ctx.LowerId().symbol;
    return new FieldShorthandAsFieldConstructor(
      tokenRange(nameNode),
      new UndecidedType(),
      nameNode.text ?? throwParserError()
    );
  };
}

class ExpressionBuilder extends AbstractParseTreeVisitor<Expression>
  implements PLVisitor<Expression> {
  private toExpression = (context: ExpressionContext): Expression => context.accept(this);
  private statementBlockBuilder: StatementBlockBuilder = new StatementBlockBuilder(
    this.toExpression
  );
  private objectFieldDeclarationBuilder: ObjectFieldDeclarationBuilder = new ObjectFieldDeclarationBuilder(
    this.toExpression
  );

  defaultResult = (): Expression => throwParserError();

  visitNestedExpr = (ctx: NestedExprContext): Expression => ctx.expression().accept(this);

  visitLiteralExpr(ctx: LiteralExprContext): Expression {
    const literalNode = ctx.literal();
    const range = contextRange(literalNode);
    if (literalNode.TRUE() != null) {
      return new LiteralExpression(range, new PrimitiveType('bool'), new BoolLiteral(true));
    }
    if (literalNode.FALSE() != null) {
      return new LiteralExpression(range, new PrimitiveType('bool'), new BoolLiteral(false));
    }
    if (literalNode.MinInt() != null) {
      return new LiteralExpression(
        range,
        new PrimitiveType('int'),
        new IntLiteral('9223372036854775808')
      );
    }
    const intLiteralNode = literalNode.IntLiteral();
    if (intLiteralNode != null) {
      const token = intLiteralNode.symbol;
      const text = intLiteralNode.text ?? throwParserError();
      return new LiteralExpression(range, new PrimitiveType('int'), new IntLiteral(text));
    }
    const stringLiteralNode = literalNode.StrLiteral();
    if (stringLiteralNode != null) {
      const literalText = stringLiteralNode.text;
      const unescaped = unescapeQuotes(literalText.substring(1, literalText.length - 1));
      return new LiteralExpression(
        range,
        new PrimitiveType('string'),
        new StringLiteral(unescaped)
      );
    }
    throw new Error('SyntaxError: Bad literal!');
  }

  visitThisExpr = (ctx: ThisExprContext): Expression =>
    new ThisExpression(tokenRange(ctx.THIS().symbol), new UndecidedType());

  visitVariableExpr = (ctx: VariableExprContext): Expression =>
    new VariableExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx.LowerId().symbol.text ?? throwParserError()
    );

  visitClassMemberExpr = (ctx: ClassMemberExprContext): Expression =>
    new ClassMemberExpression(
      contextRange(ctx),
      new UndecidedType(),
      [],
      ctx.UpperId().symbol.text ?? throwParserError(),
      tokenRange(ctx.UpperId().symbol),
      ctx.LowerId().symbol.text ?? throwParserError()
    );

  visitTupleConstructor(ctx: TupleConstructorContext): Expression {
    const range = contextRange(ctx);
    const expressionList = ctx.expression().map(this.toExpression);
    if (expressionList.length > 22) {
      throwParserError();
    }
    const type = new TupleType(expressionList.map((it) => it.type));
    return new TupleConstructorExpression(range, type, expressionList);
  }

  visitObjConstructor(ctx: ObjConstructorContext): Expression {
    return new ObjectConstructorExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx
        .objectFieldDeclarations()
        .objectFieldDeclaration()
        .map((it) => it.accept(this.objectFieldDeclarationBuilder))
    );
  }

  visitVariantConstructor = (ctx: VariantConstructorContext): Expression =>
    new VariantConstructorExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx.UpperId().symbol.text ?? throwParserError(),
      -1,
      ctx.expression().accept(this)
    );

  visitFieldAccessExpr = (ctx: FieldAccessExprContext): Expression =>
    new FieldAccessExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx.expression().accept(this),
      ctx.LowerId().symbol.text ?? throwParserError(),
      -1
    );

  visitNotExpr = (ctx: NotExprContext): Expression =>
    new UnaryExpression(
      contextRange(ctx),
      new PrimitiveType('bool'),
      '!',
      ctx.expression().accept(this)
    );

  visitNegExpr = (ctx: NegExprContext): Expression =>
    new UnaryExpression(
      contextRange(ctx),
      new PrimitiveType('int'),
      '-',
      ctx.expression().accept(this)
    );

  visitPanicExpr = (ctx: PanicExprContext): Expression =>
    new PanicExpression(contextRange(ctx), new UndecidedType(), ctx.expression().accept(this));

  visitStringToIntExpr = (ctx: StringToIntExprContext): Expression =>
    new BuiltInFunctionCallExpression(
      contextRange(ctx),
      new PrimitiveType('int'),
      'stringToInt',
      ctx.expression().accept(this)
    );

  visitIntToStringExpr = (ctx: IntToStringExprContext): Expression =>
    new BuiltInFunctionCallExpression(
      contextRange(ctx),
      new PrimitiveType('string'),
      'intToString',
      ctx.expression().accept(this)
    );

  visitPrintLineExpr = (ctx: PrintLineExprContext): Expression =>
    new BuiltInFunctionCallExpression(
      contextRange(ctx),
      new PrimitiveType('unit'),
      'println',
      ctx.expression().accept(this)
    );

  visitFunctionApplicationExpr = (ctx: FunctionApplicationExprContext): Expression =>
    new FunctionApplicationExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx.expression().accept(this),
      ctx.functionArguments().expression().map(this.toExpression)
    );

  visitFactorExpr = (ctx: FactorExprContext): Expression => {
    const operator = ctx.factorOperator().text as BinaryOperator;
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new BinaryExpression(contextRange(ctx), new PrimitiveType('int'), e1, operator, e2);
  };

  visitTermExpr = (ctx: TermExprContext): Expression => {
    const operator = ctx.termOperator().text as BinaryOperator;
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new BinaryExpression(contextRange(ctx), new PrimitiveType('int'), e1, operator, e2);
  };

  visitComparisonExpr = (ctx: ComparisonExprContext): Expression => {
    const operator = ctx.comparisonOperator().text as BinaryOperator;
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new BinaryExpression(contextRange(ctx), new PrimitiveType('bool'), e1, operator, e2);
  };

  visitConjunctionExpr = (ctx: ConjunctionExprContext): Expression => {
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new BinaryExpression(contextRange(ctx), new PrimitiveType('bool'), e1, '&&', e2);
  };

  visitConcatExpr = (ctx: ConcatExprContext): Expression => {
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new BinaryExpression(contextRange(ctx), new PrimitiveType('string'), e1, '::', e2);
  };

  visitDisjunctionExpr = (ctx: DisjunctionExprContext): Expression => {
    const e1 = ctx.expression(0).accept(this);
    const e2 = ctx.expression(1).accept(this);
    return new BinaryExpression(contextRange(ctx), new PrimitiveType('bool'), e1, '||', e2);
  };

  visitIfElseExpr = (ctx: IfElseExprContext): Expression => {
    const boolExpression = ctx.expression(0).accept(this);
    const e1 = ctx.expression(1).accept(this);
    const e2 = ctx.expression(2).accept(this);
    return new IfElseExpression(contextRange(ctx), new UndecidedType(), boolExpression, e1, e2);
  };

  visitMatchExpr = (ctx: MatchExprContext): Expression =>
    new MatchExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx.expression().accept(this),
      ctx.patternToExpr().map((pattern2Expr) => ({
        range: contextRange(pattern2Expr),
        tag: pattern2Expr.UpperId()?.symbol?.text ?? throwParserError(),
        tagOrder: -1,
        dataVariable: pattern2Expr.varOrWildCard()?.LowerId()?.symbol?.text,
        expression: pattern2Expr.expression().accept(this),
      }))
    );

  visitFunExpr = (ctx: FunExprContext): Expression => {
    const functionArguments = ctx.optionallyAnnotatedParameter().map((oneArg) => {
      const nameNode = oneArg.LowerId().symbol;
      const name = nameNode.text ?? throwParserError();
      const type = oneArg.typeAnnotation()?.typeExpr()?.accept(typeBuilder) ?? new UndecidedType();
      return { name, type };
    });
    if (functionArguments.length > 22) {
      throwParserError();
    }
    return new LambdaExpression(
      contextRange(ctx),
      new FunctionType(
        functionArguments.map((it) => it.type),
        new UndecidedType()
      ),
      functionArguments,
      new Map(),
      ctx.expression().accept(this)
    );
  };

  visitStatementBlockExpr = (ctx: StatementBlockExprContext): Expression =>
    new StatementBlockExpression(
      contextRange(ctx),
      new UndecidedType(),
      ctx.statementBlock().accept(this.statementBlockBuilder)
    );
}

const expressionBuilder = new ExpressionBuilder();
export default expressionBuilder;
