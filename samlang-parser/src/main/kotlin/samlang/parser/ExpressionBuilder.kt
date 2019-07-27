package samlang.parser

import org.apache.commons.text.StringEscapeUtils
import samlang.ast.common.BinaryOperator
import samlang.ast.lang.Expression
import samlang.ast.common.Literal
import samlang.ast.lang.Type
import samlang.ast.lang.Type.FunctionType
import samlang.ast.lang.Type.TupleType
import samlang.ast.lang.UnaryOperator
import samlang.errors.SyntaxError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

/**
 * Builder of expression nodes.
 */
internal class ExpressionBuilder(private val syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<Expression>() {

    private fun PLParser.ExpressionContext.toExpression(): Expression = this.accept(this@ExpressionBuilder)

    override fun visitNestedExpr(ctx: PLParser.NestedExprContext): Expression = ctx.expression().toExpression()

    /**
     * Converts string literal in [literal] to actual string.
     */
    private fun stringLiteralToString(literal: String): String {
        val firstChar = literal.first()
        val lastChar = literal.last()
        if (firstChar != '"' || lastChar != '"') {
            error(message = "Bad Literal: $literal")
        }
        return StringEscapeUtils.unescapeJava(literal.substring(startIndex = 1, endIndex = literal.length - 1))
    }

    override fun visitLiteralExpr(ctx: PLParser.LiteralExprContext): Expression {
        val literalNode = ctx.literal()
        val range = literalNode.range
        // Case UNIT
        literalNode.UNIT()?.let {
            return Expression.Literal(
                range = range,
                type = Type.unit,
                literal = Literal.UnitLiteral
            )
        }
        // Case TRUE
        literalNode.TRUE()?.let {
            return Expression.Literal(
                range = range,
                type = Type.bool,
                literal = Literal.BoolLiteral(value = true)
            )
        }
        // Case FALSE
        literalNode.FALSE()?.let {
            return Expression.Literal(
                range = range,
                type = Type.bool,
                literal = Literal.BoolLiteral(value = false)
            )
        }
        // Case MinInt
        literalNode.MinInt()?.let {
            return Expression.Literal(
                range = range,
                type = Type.int,
                literal = Literal.IntLiteral(value = Long.MIN_VALUE)
            )
        }
        // Case INT
        literalNode.IntLiteral()?.let { node ->
            val token = node.symbol
            val text = token.text
            val intValue = text.toLongOrNull() ?: kotlin.run {
                syntaxErrorListener.addSyntaxError(
                    syntaxError = SyntaxError(
                        file = syntaxErrorListener.file,
                        range = token.range,
                        reason = "Not a 64-bit integer."
                    )
                )
                0L
            }
            return Expression.Literal(
                range = range,
                type = Type.int,
                literal = Literal.IntLiteral(value = intValue)
            )
        }
        // Case STRING
        literalNode.StrLiteral()?.let {
            return Expression.Literal(
                range = range,
                type = Type.string,
                literal = Literal.StringLiteral(value = stringLiteralToString(literal = it.text))
            )
        }
        error(message = "Bad Literal: $ctx")
    }

    override fun visitThisExpr(ctx: PLParser.ThisExprContext): Expression =
        Expression.This(range = ctx.THIS().symbol.range, type = Type.undecided())

    override fun visitVariableExpr(ctx: PLParser.VariableExprContext): Expression = Expression.Variable(
        range = ctx.range,
        type = Type.undecided(),
        name = ctx.LowerId().symbol.text
    )

    override fun visitModuleMemberExpr(ctx: PLParser.ModuleMemberExprContext): Expression = Expression.ClassMember(
        range = ctx.range,
        type = Type.undecided(),
        moduleName = ctx.UpperId().symbol.text,
        memberName = ctx.LowerId().symbol.text
    )

    override fun visitTupleConstructor(ctx: PLParser.TupleConstructorContext): Expression {
        val expressionList = ctx.expression().map { it.toExpression() }
        val type = TupleType(mappings = expressionList.map { it.type })
        return Expression.TupleConstructor(range = ctx.range, type = type, expressionList = expressionList)
    }

    private inner class ObjectFieldDeclarationBuilder : PLBaseVisitor<Expression.ObjectConstructor.FieldConstructor>() {

        override fun visitNormalObjFieldDeclaration(
            ctx: PLParser.NormalObjFieldDeclarationContext
        ): Expression.ObjectConstructor.FieldConstructor {
            val nameNode = ctx.LowerId().symbol
            return Expression.ObjectConstructor.FieldConstructor.Field(
                range = nameNode.range,
                type = Type.undecided(),
                name = nameNode.text,
                expression = ctx.expression().toExpression()
            )
        }

        override fun visitShorthandObjFieldDeclaration(
            ctx: PLParser.ShorthandObjFieldDeclarationContext
        ): Expression.ObjectConstructor.FieldConstructor {
            val nameNode = ctx.LowerId().symbol
            return Expression.ObjectConstructor.FieldConstructor.FieldShorthand(
                range = nameNode.range,
                type = Type.undecided(),
                name = nameNode.text
            )
        }
    }

    override fun visitObjConstructor(ctx: PLParser.ObjConstructorContext): Expression {
        val objectFieldDeclarationBuilder = ObjectFieldDeclarationBuilder()
        return Expression.ObjectConstructor(
            range = ctx.range,
            type = Type.undecided(),
            spreadExpression = ctx.expression()?.toExpression(),
            fieldDeclarations = ctx.objectFieldDeclarations().objectFieldDeclaration()
                .map { it.accept(objectFieldDeclarationBuilder) }
        )
    }

    override fun visitVariantConstructor(ctx: PLParser.VariantConstructorContext): Expression =
        Expression.VariantConstructor(
            range = ctx.range,
            type = Type.undecided(),
            tag = ctx.UpperId().symbol.text,
            data = ctx.expression().toExpression()
        )

    override fun visitFieldAccessExpr(ctx: PLParser.FieldAccessExprContext): Expression = Expression.FieldAccess(
        range = ctx.range,
        type = Type.undecided(),
        expression = ctx.expression().toExpression(),
        fieldName = ctx.LowerId().symbol.text
    )

    override fun visitMethodAccessExpr(ctx: PLParser.MethodAccessExprContext): Expression = Expression.MethodAccess(
        range = ctx.range,
        type = Type.undecided(),
        expression = ctx.expression().toExpression(),
        methodName = ctx.LowerId().symbol.text
    )

    override fun visitNotExpr(ctx: PLParser.NotExprContext): Expression = Expression.Unary(
        range = ctx.range,
        type = Type.bool,
        operator = UnaryOperator.NOT,
        expression = ctx.expression().toExpression()
    )

    override fun visitNegExpr(ctx: PLParser.NegExprContext): Expression = Expression.Unary(
        range = ctx.range,
        type = Type.int,
        operator = UnaryOperator.NEG,
        expression = ctx.expression().toExpression()
    )

    override fun visitPanicExpr(ctx: PLParser.PanicExprContext): Expression = Expression.Panic(
        range = ctx.range,
        type = Type.undecided(),
        expression = ctx.expression().toExpression()
    )

    override fun visitFunctionApplicationExpr(ctx: PLParser.FunctionApplicationExprContext): Expression =
        Expression.FunctionApplication(
            range = ctx.range,
            type = Type.undecided(),
            functionExpression = ctx.expression().toExpression(),
            arguments = ctx.functionArguments().expression().map { it.toExpression() }
        )

    override fun visitFactorExpr(ctx: PLParser.FactorExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.int,
        operator = BinaryOperator.fromRaw(text = ctx.factorOperator().text),
        e1 = ctx.expression(0).toExpression(),
        e2 = ctx.expression(1).toExpression()
    )

    override fun visitTermExpr(ctx: PLParser.TermExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.int,
        operator = BinaryOperator.fromRaw(text = ctx.termOperator().text),
        e1 = ctx.expression(0).toExpression(),
        e2 = ctx.expression(1).toExpression()
    )

    override fun visitComparisonExpr(ctx: PLParser.ComparisonExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.bool,
        operator = BinaryOperator.fromRaw(text = ctx.comparisonOperator().text),
        e1 = ctx.expression(0).toExpression(),
        e2 = ctx.expression(1).toExpression()
    )

    override fun visitConjunctionExpr(ctx: PLParser.ConjunctionExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.bool,
        operator = BinaryOperator.AND,
        e1 = ctx.expression(0).toExpression(),
        e2 = ctx.expression(1).toExpression()
    )

    override fun visitDisjunctionExpr(ctx: PLParser.DisjunctionExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.bool,
        operator = BinaryOperator.OR,
        e1 = ctx.expression(0).toExpression(),
        e2 = ctx.expression(1).toExpression()
    )

    override fun visitIfElseExpr(ctx: PLParser.IfElseExprContext): Expression = Expression.IfElse(
        range = ctx.range,
        type = Type.undecided(),
        boolExpression = ctx.expression(0).toExpression(),
        e1 = ctx.expression(1).toExpression(),
        e2 = ctx.expression(2).toExpression()
    )

    override fun visitMatchExpr(ctx: PLParser.MatchExprContext): Expression = Expression.Match(
        range = ctx.range,
        type = Type.undecided(),
        matchedExpression = ctx.expression().toExpression(),
        matchingList = ctx.patternToExpr().map { pattern2Expr ->
            Expression.Match.VariantPatternToExpr(
                range = pattern2Expr.range,
                tag = pattern2Expr.UpperId().symbol.text,
                dataVariable = pattern2Expr.varOrWildCard().LowerId()?.symbol?.text,
                expression = pattern2Expr.expression().toExpression()
            )
        }
    )

    override fun visitFunExpr(ctx: PLParser.FunExprContext): Expression {
        val arguments = ctx.optionallyAnnotatedParameter().map { oneArg ->
            val nameNode = oneArg.LowerId().symbol
            val name = nameNode.text
            val type = oneArg.typeAnnotation()?.typeExpr()?.accept(TypeBuilder) ?: Type.undecided()
            name to type
        }
        return Expression.Lambda(
            range = ctx.range,
            type = FunctionType(
                argumentTypes = arguments.map { it.second },
                returnType = Type.undecided()
            ),
            parameters = arguments,
            body = ctx.expression().toExpression()
        )
    }

    override fun visitValExpr(ctx: PLParser.ValExprContext): Expression {
        val typeAnnotation = ctx.typeAnnotation()?.typeExpr()?.accept(TypeBuilder) ?: Type.undecided()
        return Expression.Val(
            range = ctx.range,
            type = Type.undecided(),
            pattern = ctx.pattern().accept(PatternBuilder),
            typeAnnotation = typeAnnotation,
            assignedExpression = ctx.expression(0).toExpression(),
            nextExpression = ctx.expression(1)?.toExpression()
        )
    }
}
