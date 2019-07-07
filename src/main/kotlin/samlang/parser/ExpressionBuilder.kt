package samlang.parser

import org.apache.commons.text.StringEscapeUtils
import samlang.ast.*
import samlang.ast.Type.FunctionType
import samlang.ast.Type.TupleType
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
        ctx.UNIT()?.let { return Literal.UnitLiteral to Type.unit(range = it.symbol.range) }
        // Case TRUE
        ctx.TRUE()?.let { return Literal.BoolLiteral(value = true) to Type.bool(range = it.symbol.range) }
        // Case FALSE
        ctx.FALSE()?.let { return Literal.BoolLiteral(value = false) to Type.bool(range = it.symbol.range) }
        // Case INT
        ctx.IntLiteral()?.let { node ->
            val text = node.text
            val intValue = text.toLongOrNull() ?: error(message = "Bad Literal: $text.")
            return Literal.IntLiteral(value = intValue) to Type.int(range = node.symbol.range)
        }
        // Case STRING
        ctx.StrLiteral()?.let {
            return Literal.StringLiteral(value = stringLiteralToString(literal = it.text)) to Type.string(
                range = it.symbol.range
            )
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

    override fun visitThisExpr(ctx: PLParser.ThisExprContext): Expression {
        val range = ctx.THIS().symbol.range
        return Expression.This(range = range, type = Type.undecided(range = range))
    }

    override fun visitVariableExpr(ctx: PLParser.VariableExprContext): Expression {
        val range = ctx.range
        return Expression.Variable(
            range = range,
            type = Type.undecided(range = range),
            name = ctx.LowerId().symbol.text
        )
    }

    override fun visitModuleMemberExpr(ctx: PLParser.ModuleMemberExprContext): Expression {
        val range = ctx.range
        return Expression.ModuleMember(
            range = range,
            type = Type.undecided(range = range),
            moduleName = ctx.UpperId().symbol.text,
            memberName = ctx.LowerId().symbol.text
        )
    }

    override fun visitTupleConstructor(ctx: PLParser.TupleConstructorContext): Expression {
        val range = ctx.range
        val expressionList = ctx.expression().map { it.accept(ExpressionBuilder) }
        val type = TupleType(range = range, mappings = expressionList.map { it.type })
        return Expression.TupleConstructor(range = range, type = type, expressionList = expressionList)
    }

    private object ObjectFieldDeclarationBuilder : PLBaseVisitor<Expression.ObjectConstructor.FieldConstructor>() {

        override fun visitNormalObjFieldDeclaration(
            ctx: PLParser.NormalObjFieldDeclarationContext
        ): Expression.ObjectConstructor.FieldConstructor {
            val nameNode = ctx.LowerId().symbol
            val range = nameNode.range
            return Expression.ObjectConstructor.FieldConstructor.Field(
                range = range,
                type = Type.undecided(range = range),
                name = nameNode.text,
                expression = ctx.expression().accept(ExpressionBuilder)
            )
        }

        override fun visitShorthandObjFieldDeclaration(
            ctx: PLParser.ShorthandObjFieldDeclarationContext
        ): Expression.ObjectConstructor.FieldConstructor {
            val nameNode = ctx.LowerId().symbol
            val range = nameNode.range
            return Expression.ObjectConstructor.FieldConstructor.FieldShorthand(
                range = range,
                type = Type.undecided(range = range),
                name = nameNode.text
            )
        }

    }

    override fun visitObjConstructor(ctx: PLParser.ObjConstructorContext): Expression {
        val range = ctx.range
        return Expression.ObjectConstructor(
            range = range,
            type = Type.undecided(range = range),
            spreadExpression = ctx.expression()?.accept(ExpressionBuilder),
            fieldDeclarations = ctx.objectFieldDeclarations().objectFieldDeclaration()
                .map { it.accept(ObjectFieldDeclarationBuilder) }
        )
    }

    override fun visitVariantConstructor(ctx: PLParser.VariantConstructorContext): Expression {
        val range = ctx.range
        return Expression.VariantConstructor(
            range = range,
            type = Type.undecided(range = range),
            tag = ctx.UpperId().symbol.text,
            data = ctx.expression().accept(ExpressionBuilder)
        )
    }

    override fun visitFieldAccessExpr(ctx: PLParser.FieldAccessExprContext): Expression {
        val range = ctx.range
        return Expression.FieldAccess(
            range = range,
            type = Type.undecided(range = range),
            expression = ctx.expression().accept(ExpressionBuilder),
            fieldName = ctx.LowerId().symbol.text
        )
    }

    override fun visitMethodAccessExpr(ctx: PLParser.MethodAccessExprContext): Expression {
        val range = ctx.range
        return Expression.MethodAccess(
            range = range,
            type = Type.undecided(range = range),
            expression = ctx.expression().accept(ExpressionBuilder),
            methodName = ctx.LowerId().symbol.text
        )
    }

    override fun visitNotExpr(ctx: PLParser.NotExprContext): Expression {
        val range = ctx.range
        return Expression.Unary(
            range = range,
            type = Type.bool(range = range),
            operator = UnaryOperator.NOT,
            expression = ctx.expression().accept(ExpressionBuilder)
        )
    }

    override fun visitNegExpr(ctx: PLParser.NegExprContext): Expression {
        val range = ctx.range
        return Expression.Unary(
            range = range,
            type = Type.int(range = range),
            operator = UnaryOperator.NEG,
            expression = ctx.expression().accept(ExpressionBuilder)
        )
    }

    override fun visitPanicExpr(ctx: PLParser.PanicExprContext): Expression {
        val range = ctx.range
        return Expression.Panic(
            range = range,
            type = Type.undecided(range = range),
            expression = ctx.expression().accept(ExpressionBuilder)
        )
    }

    override fun visitFunctionApplicationExpr(ctx: PLParser.FunctionApplicationExprContext): Expression {
        val range = ctx.range
        return Expression.FunctionApplication(
            range = ctx.range,
            type = Type.undecided(range = range),
            functionExpression = ctx.expression().accept(ExpressionBuilder),
            arguments = ctx.functionArguments().expression().map { it.accept(ExpressionBuilder) }
        )
    }

    override fun visitFactorExpr(ctx: PLParser.FactorExprContext): Expression {
        val range = ctx.range
        return Expression.Binary(
            range = range,
            type = Type.int(range = range),
            operator = BinaryOperator.fromRaw(text = ctx.factorOperator().text),
            e1 = ctx.expression(0).accept(ExpressionBuilder),
            e2 = ctx.expression(1).accept(ExpressionBuilder)
        )
    }

    override fun visitTermExpr(ctx: PLParser.TermExprContext): Expression {
        val range = ctx.range
        return Expression.Binary(
            range = range,
            type = Type.int(range = range),
            operator = BinaryOperator.fromRaw(text = ctx.termOperator().text),
            e1 = ctx.expression(0).accept(ExpressionBuilder),
            e2 = ctx.expression(1).accept(ExpressionBuilder)
        )
    }

    override fun visitComparisonExpr(ctx: PLParser.ComparisonExprContext): Expression {
        val range = ctx.range
        return Expression.Binary(
            range = range,
            type = Type.bool(range = range),
            operator = BinaryOperator.fromRaw(text = ctx.comparisonOperator().text),
            e1 = ctx.expression(0).accept(ExpressionBuilder),
            e2 = ctx.expression(1).accept(ExpressionBuilder)
        )
    }

    override fun visitConjunctionExpr(ctx: PLParser.ConjunctionExprContext): Expression {
        val range = ctx.range
        return Expression.Binary(
            range = range,
            type = Type.bool(range = range),
            operator = BinaryOperator.AND,
            e1 = ctx.expression(0).accept(ExpressionBuilder),
            e2 = ctx.expression(1).accept(ExpressionBuilder)
        )
    }

    override fun visitDisjunctionExpr(ctx: PLParser.DisjunctionExprContext): Expression {
        val range = ctx.range
        return Expression.Binary(
            range = range,
            type = Type.bool(range = range),
            operator = BinaryOperator.OR,
            e1 = ctx.expression(0).accept(ExpressionBuilder),
            e2 = ctx.expression(1).accept(ExpressionBuilder)
        )
    }

    override fun visitIfElseExpr(ctx: PLParser.IfElseExprContext): Expression {
        val range = ctx.range
        return Expression.IfElse(
            range = range,
            type = Type.undecided(range = range),
            boolExpression = ctx.expression(0).accept(ExpressionBuilder),
            e1 = ctx.expression(1).accept(ExpressionBuilder),
            e2 = ctx.expression(2).accept(ExpressionBuilder)
        )
    }

    override fun visitMatchExpr(ctx: PLParser.MatchExprContext): Expression {
        val range = ctx.range
        return Expression.Match(
            range = range,
            type = Type.undecided(range = range),
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
    }

    override fun visitFunExpr(ctx: PLParser.FunExprContext): Expression {
        val range = ctx.range
        val arguments = ctx.optionallyAnnotatedParameter().map { oneArg ->
            val nameNode = oneArg.LowerId().symbol
            val name = nameNode.text
            val type = oneArg.typeAnnotation()?.typeExpr()?.accept(TypeExpressionBuilder) ?: Type.undecided(
                range = nameNode.range
            )
            name to type
        }
        val body = ctx.expression().accept(ExpressionBuilder)
        val type = FunctionType(
            range = range,
            argumentTypes = arguments.map { it.second },
            returnType = Type.undecided(range = body.range)
        )
        return Expression.Lambda(range = range, type = type, arguments = arguments, body = body)
    }

    override fun visitValExpr(ctx: PLParser.ValExprContext): Expression {
        val range = ctx.range
        val typeAnnotation =
            ctx.typeAnnotation()?.typeExpr()?.accept(TypeExpressionBuilder) ?: Type.undecided(range = range)
        return Expression.Val(
            range = range,
            type = Type.undecided(range = range),
            pattern = ctx.pattern().accept(PatternBuilder),
            typeAnnotation = typeAnnotation,
            assignedExpression = ctx.expression(0).accept(ExpressionBuilder),
            nextExpression = ctx.expression(1)?.accept(ExpressionBuilder)
        )
    }

}

