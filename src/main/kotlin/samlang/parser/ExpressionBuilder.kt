package samlang.parser

import org.apache.commons.text.StringEscapeUtils
import samlang.ast.BinaryOperator
import samlang.ast.Expression
import samlang.ast.Literal
import samlang.ast.Type
import samlang.ast.Type.FunctionType
import samlang.ast.Type.TupleType
import samlang.ast.UnaryOperator
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

/**
 * Builder of expression nodes.
 */
internal object ExpressionBuilder : PLBaseVisitor<Expression>() {

    override fun visitNestedExpr(ctx: PLParser.NestedExprContext): Expression =
        ctx.expression().accept(ExpressionBuilder)

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

    /**
     * Build a literal with its type.
     */
    private fun buildValue(ctx: PLParser.LiteralContext): Pair<Literal, Type> {
        // Case UNIT
        ctx.UNIT()?.let { return Literal.UnitLiteral to Type.unit }
        // Case TRUE
        ctx.TRUE()?.let { return Literal.BoolLiteral(value = true) to Type.bool }
        // Case FALSE
        ctx.FALSE()?.let { return Literal.BoolLiteral(value = false) to Type.bool }
        // Case INT
        ctx.IntLiteral()?.let { node ->
            val text = node.text
            val intValue = text.toLongOrNull() ?: error(message = "Bad Literal: $text.")
            return Literal.IntLiteral(value = intValue) to Type.int
        }
        // Case STRING
        ctx.StrLiteral()?.let {
            return Literal.StringLiteral(value = stringLiteralToString(literal = it.text)) to Type.string
        }
        error(message = "Bad Literal: $ctx")
    }

    override fun visitLiteralExpr(ctx: PLParser.LiteralExprContext): Expression {
        val (literal, type) = buildValue(ctx.literal())
        return Expression.Literal(
            range = ctx.literal().range,
            type = type,
            literal = literal
        )
    }

    override fun visitThisExpr(ctx: PLParser.ThisExprContext): Expression =
        Expression.This(range = ctx.THIS().symbol.range, type = Type.undecided())

    override fun visitVariableExpr(ctx: PLParser.VariableExprContext): Expression = Expression.Variable(
        range = ctx.range,
        type = Type.undecided(),
        name = ctx.LowerId().symbol.text
    )

    override fun visitModuleMemberExpr(ctx: PLParser.ModuleMemberExprContext): Expression = Expression.ModuleMember(
        range = ctx.range,
        type = Type.undecided(),
        moduleName = ctx.UpperId().symbol.text,
        memberName = ctx.LowerId().symbol.text
    )

    override fun visitTupleConstructor(ctx: PLParser.TupleConstructorContext): Expression {
        val expressionList = ctx.expression().map { it.accept(ExpressionBuilder) }
        val type = TupleType(mappings = expressionList.map { it.type })
        return Expression.TupleConstructor(range = ctx.range, type = type, expressionList = expressionList)
    }

    private object ObjectFieldDeclarationBuilder : PLBaseVisitor<Expression.ObjectConstructor.FieldConstructor>() {

        override fun visitNormalObjFieldDeclaration(
            ctx: PLParser.NormalObjFieldDeclarationContext
        ): Expression.ObjectConstructor.FieldConstructor {
            val nameNode = ctx.LowerId().symbol
            return Expression.ObjectConstructor.FieldConstructor.Field(
                range = nameNode.range,
                type = Type.undecided(),
                name = nameNode.text,
                expression = ctx.expression().accept(ExpressionBuilder)
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

    override fun visitObjConstructor(ctx: PLParser.ObjConstructorContext): Expression = Expression.ObjectConstructor(
        range = ctx.range,
        type = Type.undecided(),
        spreadExpression = ctx.expression()?.accept(ExpressionBuilder),
        fieldDeclarations = ctx.objectFieldDeclarations().objectFieldDeclaration()
            .map { it.accept(ObjectFieldDeclarationBuilder) }
    )

    override fun visitVariantConstructor(ctx: PLParser.VariantConstructorContext): Expression =
        Expression.VariantConstructor(
            range = ctx.range,
            type = Type.undecided(),
            tag = ctx.UpperId().symbol.text,
            data = ctx.expression().accept(ExpressionBuilder)
        )

    override fun visitFieldAccessExpr(ctx: PLParser.FieldAccessExprContext): Expression = Expression.FieldAccess(
        range = ctx.range,
        type = Type.undecided(),
        expression = ctx.expression().accept(ExpressionBuilder),
        fieldName = ctx.LowerId().symbol.text
    )

    override fun visitMethodAccessExpr(ctx: PLParser.MethodAccessExprContext): Expression = Expression.MethodAccess(
        range = ctx.range,
        type = Type.undecided(),
        expression = ctx.expression().accept(ExpressionBuilder),
        methodName = ctx.LowerId().symbol.text
    )

    override fun visitNotExpr(ctx: PLParser.NotExprContext): Expression = Expression.Unary(
        range = ctx.range,
        type = Type.bool,
        operator = UnaryOperator.NOT,
        expression = ctx.expression().accept(ExpressionBuilder)
    )

    override fun visitNegExpr(ctx: PLParser.NegExprContext): Expression = Expression.Unary(
        range = ctx.range,
        type = Type.int,
        operator = UnaryOperator.NEG,
        expression = ctx.expression().accept(ExpressionBuilder)
    )

    override fun visitPanicExpr(ctx: PLParser.PanicExprContext): Expression = Expression.Panic(
        range = ctx.range,
        type = Type.undecided(),
        expression = ctx.expression().accept(ExpressionBuilder)
    )

    override fun visitFunctionApplicationExpr(ctx: PLParser.FunctionApplicationExprContext): Expression =
        Expression.FunctionApplication(
            range = ctx.range,
            type = Type.undecided(),
            functionExpression = ctx.expression().accept(ExpressionBuilder),
            arguments = ctx.functionArguments().expression().map { it.accept(ExpressionBuilder) }
        )

    override fun visitFactorExpr(ctx: PLParser.FactorExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.int,
        operator = BinaryOperator.fromRaw(text = ctx.factorOperator().text),
        e1 = ctx.expression(0).accept(ExpressionBuilder),
        e2 = ctx.expression(1).accept(ExpressionBuilder)
    )

    override fun visitTermExpr(ctx: PLParser.TermExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.int,
        operator = BinaryOperator.fromRaw(text = ctx.termOperator().text),
        e1 = ctx.expression(0).accept(ExpressionBuilder),
        e2 = ctx.expression(1).accept(ExpressionBuilder)
    )

    override fun visitComparisonExpr(ctx: PLParser.ComparisonExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.bool,
        operator = BinaryOperator.fromRaw(text = ctx.comparisonOperator().text),
        e1 = ctx.expression(0).accept(ExpressionBuilder),
        e2 = ctx.expression(1).accept(ExpressionBuilder)
    )

    override fun visitConjunctionExpr(ctx: PLParser.ConjunctionExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.bool,
        operator = BinaryOperator.AND,
        e1 = ctx.expression(0).accept(ExpressionBuilder),
        e2 = ctx.expression(1).accept(ExpressionBuilder)
    )

    override fun visitDisjunctionExpr(ctx: PLParser.DisjunctionExprContext): Expression = Expression.Binary(
        range = ctx.range,
        type = Type.bool,
        operator = BinaryOperator.OR,
        e1 = ctx.expression(0).accept(ExpressionBuilder),
        e2 = ctx.expression(1).accept(ExpressionBuilder)
    )

    override fun visitIfElseExpr(ctx: PLParser.IfElseExprContext): Expression = Expression.IfElse(
        range = ctx.range,
        type = Type.undecided(),
        boolExpression = ctx.expression(0).accept(ExpressionBuilder),
        e1 = ctx.expression(1).accept(ExpressionBuilder),
        e2 = ctx.expression(2).accept(ExpressionBuilder)
    )

    override fun visitMatchExpr(ctx: PLParser.MatchExprContext): Expression = Expression.Match(
        range = ctx.range,
        type = Type.undecided(),
        matchedExpression = ctx.expression().accept(ExpressionBuilder),
        matchingList = ctx.patternToExpr().map { pattern2Expr ->
            Expression.Match.VariantPatternToExpr(
                range = pattern2Expr.range,
                tag = pattern2Expr.UpperId().symbol.text,
                dataVariable = pattern2Expr.varOrWildCard().LowerId()?.symbol?.text,
                expression = pattern2Expr.expression().accept(ExpressionBuilder)
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
            body = ctx.expression().accept(ExpressionBuilder)
        )
    }

    override fun visitValExpr(ctx: PLParser.ValExprContext): Expression {
        val typeAnnotation = ctx.typeAnnotation()?.typeExpr()?.accept(TypeBuilder) ?: Type.undecided()
        return Expression.Val(
            range = ctx.range,
            type = Type.undecided(),
            pattern = ctx.pattern().accept(PatternBuilder),
            typeAnnotation = typeAnnotation,
            assignedExpression = ctx.expression(0).accept(ExpressionBuilder),
            nextExpression = ctx.expression(1)?.accept(ExpressionBuilder)
        )
    }
}
