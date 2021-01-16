import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import StatementBlockBuilder from './parser-statement-block-builder';
import TypeBuilder from './parser-type-builder';
import { tokenRange, contextRange } from './parser-util';

import {
  UndecidedTypes,
  unitType,
  boolType,
  intType,
  stringType,
  tupleType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import { binaryOperatorSymbolTable, AND, OR, CONCAT } from 'samlang-core-ast/common-operators';
import {
  ObjectConstructorExpressionFieldConstructor,
  VariantPatternToExpression,
  SamlangExpression,
  EXPRESSION_TRUE,
  EXPRESSION_FALSE,
  EXPRESSION_INT,
  EXPRESSION_STRING,
  EXPRESSION_THIS,
  EXPRESSION_VARIABLE,
  EXPRESSION_CLASS_MEMBER,
  EXPRESSION_TUPLE_CONSTRUCTOR,
  EXPRESSION_OBJECT_CONSTRUCTOR,
  EXPRESSION_VARIANT_CONSTRUCTOR,
  EXPRESSION_PANIC,
  EXPRESSION_FIELD_ACCESS,
  EXPRESSION_UNARY,
  EXPRESSION_BUILTIN_FUNCTION_CALL,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_MATCH,
  EXPRESSION_LAMBDA,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import type {
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
  NoArgFunExprContext,
  StatementBlockExprContext,
} from 'samlang-core-parser-generated/PLParser';
import type { PLVisitor } from 'samlang-core-parser-generated/PLVisitor';
import { Long, isNotNull, checkNotNull } from 'samlang-core-utils';

const unescapeQuotes = (source: string): string => source.replace(/\\"/g, '"');

class ObjectFieldDeclarationBuilder
  extends AbstractParseTreeVisitor<ObjectConstructorExpressionFieldConstructor | null>
  implements PLVisitor<ObjectConstructorExpressionFieldConstructor | null> {
  constructor(private readonly toExpression: (context: ExpressionContext) => SamlangExpression) {
    super();
  }

  // istanbul ignore next
  defaultResult = (): ObjectConstructorExpressionFieldConstructor | null => null;

  visitNormalObjFieldDeclaration = (
    ctx: NormalObjFieldDeclarationContext
  ): ObjectConstructorExpressionFieldConstructor | null => {
    const nameNode = ctx.LowerId().symbol;
    const name = checkNotNull(nameNode.text);
    return {
      range: tokenRange(nameNode),
      type: UndecidedTypes.next(),
      name,
      expression: this.toExpression(ctx.expression()),
    };
  };

  visitShorthandObjFieldDeclaration = (
    ctx: ShorthandObjFieldDeclarationContext
  ): ObjectConstructorExpressionFieldConstructor | null => {
    const nameNode = ctx.LowerId().symbol;
    const name = checkNotNull(nameNode.text);
    return {
      range: tokenRange(nameNode),
      type: UndecidedTypes.next(),
      name,
    };
  };
}

export default class ExpressionBuilder
  extends AbstractParseTreeVisitor<SamlangExpression | null>
  implements PLVisitor<SamlangExpression | null> {
  private static DUMMY_EXPRESSION = EXPRESSION_PANIC({
    range: Range.DUMMY,
    type: UndecidedTypes.next(),
    expression: EXPRESSION_STRING(Range.DUMMY, 'dummy'),
  });

  private readonly typeBuilder: TypeBuilder;
  private readonly statementBlockBuilder: StatementBlockBuilder;

  constructor(
    private readonly errorCollector: ModuleErrorCollector,
    private readonly resolveClass: (className: string) => ModuleReference
  ) {
    super();
    this.typeBuilder = new TypeBuilder(resolveClass);
    this.statementBlockBuilder = new StatementBlockBuilder(this.toExpression, this.typeBuilder);
  }

  private toExpression = (context?: ExpressionContext): SamlangExpression => {
    const parsed = checkNotNull(context).accept(this);
    if (parsed != null) {
      return parsed;
    }
    return ExpressionBuilder.DUMMY_EXPRESSION;
  };

  private objectFieldDeclarationBuilder = new ObjectFieldDeclarationBuilder(this.toExpression);

  defaultResult = (): SamlangExpression | null => null;

  visitNestedExpr = (ctx: NestedExprContext): SamlangExpression | null =>
    ctx.expression().accept(this);

  visitLiteralExpr = (ctx: LiteralExprContext): SamlangExpression | null => {
    const literalNode = ctx.literal();
    const range = contextRange(literalNode);
    if (literalNode.TRUE() != null) {
      return EXPRESSION_TRUE(range);
    }
    if (literalNode.FALSE() != null) {
      return EXPRESSION_FALSE(range);
    }
    if (literalNode.MinInt() != null) {
      return EXPRESSION_INT(range, Long.MIN_VALUE);
    }
    const intLiteralNode = literalNode.IntLiteral();
    if (intLiteralNode != null) {
      const text = checkNotNull(intLiteralNode.text);
      const parsedBigInt = BigInt(text);
      if (parsedBigInt > BigInt('9223372036854775807')) {
        this.errorCollector.reportSyntaxError(range, 'Not a 64-bit integer.');
      }
      return EXPRESSION_INT(range, Long.fromString(text));
    }
    const stringLiteralNode = checkNotNull(literalNode.StrLiteral());
    const literalText = stringLiteralNode.text;
    const unescaped = unescapeQuotes(literalText.substring(1, literalText.length - 1));
    return EXPRESSION_STRING(range, unescaped);
  };

  visitThisExpr = (ctx: ThisExprContext): SamlangExpression | null =>
    EXPRESSION_THIS({ range: tokenRange(ctx.THIS().symbol), type: UndecidedTypes.next() });

  visitVariableExpr = (ctx: VariableExprContext): SamlangExpression | null => {
    const name = checkNotNull(ctx.LowerId().symbol.text);
    return EXPRESSION_VARIABLE({ range: contextRange(ctx), type: UndecidedTypes.next(), name });
  };

  visitClassMemberExpr = (ctx: ClassMemberExprContext): SamlangExpression | null => {
    const classNameNode = ctx.UpperId().symbol;
    const memberNameNode = ctx.LowerId().symbol;
    const className = checkNotNull(classNameNode.text);
    const memberName = checkNotNull(memberNameNode.text);
    return EXPRESSION_CLASS_MEMBER({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      typeArguments: [], // At parsing time, the information is not resolved yet.
      moduleReference: this.resolveClass(className),
      className,
      classNameRange: tokenRange(classNameNode),
      memberName,
      memberNameRange: tokenRange(memberNameNode),
    });
  };

  visitTupleConstructor(ctx: TupleConstructorContext): SamlangExpression | null {
    const range = contextRange(ctx);
    const expressions = ctx.expression().map(this.toExpression);
    const type = tupleType(expressions.map((it) => it.type));
    return EXPRESSION_TUPLE_CONSTRUCTOR({ range, type, expressions });
  }

  visitObjConstructor = (ctx: ObjConstructorContext): SamlangExpression =>
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      fieldDeclarations: ctx
        .objectFieldDeclarations()
        .objectFieldDeclaration()
        .map((it) => it.accept(this.objectFieldDeclarationBuilder))
        .filter(isNotNull),
    });

  visitVariantConstructor = (ctx: VariantConstructorContext): SamlangExpression | null => {
    const tag = checkNotNull(ctx.UpperId().symbol.text);
    return EXPRESSION_VARIANT_CONSTRUCTOR({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      tag,
      tagOrder: -1, // To be resolved during type checking
      data: this.toExpression(ctx.expression()),
    });
  };

  visitFieldAccessExpr = (ctx: FieldAccessExprContext): SamlangExpression | null => {
    const fieldName = checkNotNull(ctx.LowerId().symbol.text);
    return EXPRESSION_FIELD_ACCESS({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      expression: this.toExpression(ctx.expression()),
      fieldName,
      fieldOrder: -1, // To be resolved during type checking
    });
  };

  visitNotExpr = (ctx: NotExprContext): SamlangExpression | null =>
    EXPRESSION_UNARY({
      range: contextRange(ctx),
      type: boolType,
      operator: '!',
      expression: this.toExpression(ctx.expression()),
    });

  visitNegExpr = (ctx: NegExprContext): SamlangExpression | null =>
    EXPRESSION_UNARY({
      range: contextRange(ctx),
      type: intType,
      operator: '-',
      expression: this.toExpression(ctx.expression()),
    });

  visitPanicExpr = (ctx: PanicExprContext): SamlangExpression | null =>
    EXPRESSION_PANIC({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      expression: this.toExpression(ctx.expression()),
    });

  visitStringToIntExpr = (ctx: StringToIntExprContext): SamlangExpression | null =>
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: contextRange(ctx),
      type: intType,
      functionName: 'stringToInt',
      argumentExpression: this.toExpression(ctx.expression()),
    });

  visitIntToStringExpr = (ctx: IntToStringExprContext): SamlangExpression | null =>
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: contextRange(ctx),
      type: stringType,
      functionName: 'intToString',
      argumentExpression: this.toExpression(ctx.expression()),
    });

  visitPrintLineExpr = (ctx: PrintLineExprContext): SamlangExpression | null =>
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: contextRange(ctx),
      type: unitType,
      functionName: 'println',
      argumentExpression: this.toExpression(ctx.expression()),
    });

  visitFunctionApplicationExpr = (ctx: FunctionApplicationExprContext): SamlangExpression | null =>
    EXPRESSION_FUNCTION_CALL({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      functionExpression: this.toExpression(ctx.expression()),
      functionArguments: ctx.functionArguments().expression().map(this.toExpression),
    });

  visitFactorExpr = (ctx: FactorExprContext): SamlangExpression | null => {
    const operator = checkNotNull(binaryOperatorSymbolTable[ctx.factorOperator().text]);
    const range = contextRange(ctx);
    const e1 = this.toExpression(ctx.expression(0));
    const e2 = this.toExpression(ctx.expression(1));
    return EXPRESSION_BINARY({ range, type: intType, operator, e1, e2 });
  };

  visitTermExpr = (ctx: TermExprContext): SamlangExpression | null => {
    const operator = checkNotNull(binaryOperatorSymbolTable[ctx.termOperator().text]);
    const range = contextRange(ctx);
    const e1 = this.toExpression(ctx.expression(0));
    const e2 = this.toExpression(ctx.expression(1));
    return EXPRESSION_BINARY({ range, type: intType, operator, e1, e2 });
  };

  visitComparisonExpr = (ctx: ComparisonExprContext): SamlangExpression | null => {
    const operator = checkNotNull(binaryOperatorSymbolTable[ctx.comparisonOperator().text]);
    const range = contextRange(ctx);
    const e1 = this.toExpression(ctx.expression(0));
    const e2 = this.toExpression(ctx.expression(1));
    return EXPRESSION_BINARY({ range, type: boolType, operator, e1, e2 });
  };

  visitConjunctionExpr = (ctx: ConjunctionExprContext): SamlangExpression => {
    const range = contextRange(ctx);
    const e1 = this.toExpression(ctx.expression(0));
    const e2 = this.toExpression(ctx.expression(1));
    return EXPRESSION_BINARY({ range, type: boolType, operator: AND, e1, e2 });
  };

  visitDisjunctionExpr = (ctx: DisjunctionExprContext): SamlangExpression => {
    const range = contextRange(ctx);
    const e1 = this.toExpression(ctx.expression(0));
    const e2 = this.toExpression(ctx.expression(1));
    return EXPRESSION_BINARY({ range, type: boolType, operator: OR, e1, e2 });
  };

  visitConcatExpr = (ctx: ConcatExprContext): SamlangExpression => {
    const range = contextRange(ctx);
    const e1 = this.toExpression(ctx.expression(0));
    const e2 = this.toExpression(ctx.expression(1));
    return EXPRESSION_BINARY({ range, type: stringType, operator: CONCAT, e1, e2 });
  };

  visitIfElseExpr = (ctx: IfElseExprContext): SamlangExpression => {
    const range = contextRange(ctx);
    const boolExpression = this.toExpression(ctx.expression(0));
    const e1 = this.toExpression(ctx.expression(1));
    const e2 = this.toExpression(ctx.expression(2));
    return EXPRESSION_IF_ELSE({ range, type: UndecidedTypes.next(), boolExpression, e1, e2 });
  };

  visitMatchExpr = (ctx: MatchExprContext): SamlangExpression | null =>
    EXPRESSION_MATCH({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      matchedExpression: this.toExpression(ctx.expression()),
      matchingList: ctx
        .patternToExpr()
        .map((pattern2Expr): VariantPatternToExpression | null => {
          const tag = pattern2Expr.UpperId()?.symbol?.text;
          if (tag == null) {
            return null;
          }
          const dataVariableName = pattern2Expr.varOrWildCard()?.LowerId()?.symbol?.text;
          return {
            range: contextRange(pattern2Expr),
            tag,
            tagOrder: -1, // To be resolved during type checking
            dataVariable:
              dataVariableName == null ? undefined : [dataVariableName, UndecidedTypes.next()],
            expression: this.toExpression(pattern2Expr.expression()),
          };
        })
        .filter(isNotNull),
    });

  visitFunExpr = (ctx: FunExprContext): SamlangExpression | null => {
    const parameters = ctx
      .optionallyAnnotatedParameter()
      .map((oneArg) => {
        const nameNode = oneArg.LowerId().symbol;
        const name = checkNotNull(nameNode.text);
        const type =
          oneArg.typeAnnotation()?.typeExpr()?.accept(this.typeBuilder) ?? UndecidedTypes.next();
        return [name, type] as const;
      })
      .filter(isNotNull);
    return EXPRESSION_LAMBDA({
      range: contextRange(ctx),
      type: functionType(
        parameters.map((it) => it[1]),
        UndecidedTypes.next()
      ),
      parameters,
      captured: {},
      body: this.toExpression(ctx.expression()),
    });
  };

  visitNoArgFunExpr = (ctx: NoArgFunExprContext): SamlangExpression | null => {
    return EXPRESSION_LAMBDA({
      range: contextRange(ctx),
      type: functionType([], UndecidedTypes.next()),
      parameters: [],
      captured: {},
      body: this.toExpression(ctx.expression()),
    });
  };

  visitStatementBlockExpr = (ctx: StatementBlockExprContext): SamlangExpression | null => {
    const block = checkNotNull(ctx.statementBlock().accept(this.statementBlockBuilder));
    return EXPRESSION_STATEMENT_BLOCK({
      range: contextRange(ctx),
      type: UndecidedTypes.next(),
      block,
    });
  };
}
