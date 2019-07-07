package samlang.parser

import org.apache.commons.text.StringEscapeUtils
import samlang.ast.common.BinaryOperator
import samlang.ast.common.Literal
import samlang.ast.common.UnaryOperator
import samlang.ast.raw.RawExpr
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object ExprBuilder : PLBaseVisitor<RawExpr>() {

    override fun visitNestedExpr(ctx: PLParser.NestedExprContext): RawExpr = ctx.expression().accept(ExprBuilder)

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

    private fun buildValue(ctx: PLParser.LiteralContext): Literal {
        // Case UNIT
        ctx.UNIT()?.let { return Literal.UnitLiteral }
        // Case TRUE
        ctx.TRUE()?.let { return Literal.BoolLiteral(v = true) }
        // Case FALSE
        ctx.FALSE()?.let { return Literal.BoolLiteral(v = false) }
        // Case INT
        ctx.IntLiteral()?.let { node ->
            val text = node.text
            val intValue = text.toLongOrNull() ?: error(message = "Bad Literal: $text.")
            return Literal.IntLiteral(v = intValue)
        }
        // Case STRING
        ctx.StrLiteral()?.let { return Literal.StringLiteral(v = stringLiteralToString(literal = it.text)) }
        error(message = "Bad Literal: $ctx")
    }

    override fun visitLiteralExpr(ctx: PLParser.LiteralExprContext): RawExpr = RawExpr.Literal(
        range = ctx.literal().range,
        literal = buildValue(ctx.literal())
    )

    override fun visitThisExpr(ctx: PLParser.ThisExprContext): RawExpr = RawExpr.This(
        range = ctx.THIS().symbol.range
    )

    override fun visitVariableExpr(ctx: PLParser.VariableExprContext): RawExpr = RawExpr.Variable(
        range = ctx.range,
        name = ctx.LowerId().symbol.text
    )

    override fun visitModuleMemberExpr(ctx: PLParser.ModuleMemberExprContext): RawExpr = RawExpr.ModuleMember(
        range = ctx.range,
        moduleName = ctx.UpperId().symbol.text,
        memberName = ctx.LowerId().symbol.text
    )

    override fun visitTupleConstructor(ctx: PLParser.TupleConstructorContext): RawExpr =
        RawExpr.TupleConstructor(
            range = ctx.range,
            exprList = ctx.expression().map { it.accept(ExprBuilder) }
        )

    private object ObjectFieldDeclarationBuilder : PLBaseVisitor<RawExpr.ObjectConstructor.FieldConstructor>() {

        override fun visitNormalObjFieldDeclaration(
            ctx: PLParser.NormalObjFieldDeclarationContext
        ): RawExpr.ObjectConstructor.FieldConstructor = RawExpr.ObjectConstructor.FieldConstructor.Field(
            name = ctx.LowerId().symbol.rangeWithName,
            expr = ctx.expression().accept(ExprBuilder)
        )

        override fun visitShorthandObjFieldDeclaration(
            ctx: PLParser.ShorthandObjFieldDeclarationContext
        ): RawExpr.ObjectConstructor.FieldConstructor = RawExpr.ObjectConstructor.FieldConstructor.FieldShorthand(
            name = ctx.LowerId().symbol.rangeWithName
        )

    }

    override fun visitObjConstructor(ctx: PLParser.ObjConstructorContext): RawExpr = RawExpr.ObjectConstructor(
        range = ctx.range,
        spreadExpr = ctx.expression()?.accept(ExprBuilder),
        fieldDeclarations = ctx.objectFieldDeclarations().objectFieldDeclaration()
            .map { it.accept(ObjectFieldDeclarationBuilder) }
    )

    override fun visitVariantConstructor(ctx: PLParser.VariantConstructorContext): RawExpr =
        RawExpr.VariantConstructor(
            range = ctx.range,
            tag = ctx.UpperId().symbol.rangeWithName,
            data = ctx.expression().accept(ExprBuilder)
        )

    override fun visitFieldAccessExpr(ctx: PLParser.FieldAccessExprContext): RawExpr =
        RawExpr.FieldAccess(
            range = ctx.range,
            expr = ctx.expression().accept(ExprBuilder),
            fieldName = ctx.LowerId().symbol.rangeWithName
        )

    override fun visitMethodAccessExpr(ctx: PLParser.MethodAccessExprContext): RawExpr =
        RawExpr.MethodAccess(
            range = ctx.range,
            expr = ctx.expression().accept(ExprBuilder),
            methodName = ctx.LowerId().symbol.rangeWithName
        )

    override fun visitNotExpr(ctx: PLParser.NotExprContext): RawExpr = RawExpr.Unary(
        range = ctx.range,
        operator = UnaryOperator.NOT,
        expr = ctx.expression().accept(ExprBuilder)
    )

    override fun visitNegExpr(ctx: PLParser.NegExprContext): RawExpr = RawExpr.Unary(
        range = ctx.range,
        operator = UnaryOperator.NEG,
        expr = ctx.expression().accept(ExprBuilder)
    )

    override fun visitPanicExpr(ctx: PLParser.PanicExprContext): RawExpr = RawExpr.Panic(
        range = ctx.range,
        expr = ctx.expression().accept(ExprBuilder)
    )

    override fun visitFunctionApplicationExpr(ctx: PLParser.FunctionApplicationExprContext): RawExpr = RawExpr.FunApp(
        range = ctx.range,
        funExpr = ctx.expression().accept(ExprBuilder),
        arguments = ctx.functionArguments().expression().map { it.accept(ExprBuilder) }
    )

    override fun visitFactorExpr(ctx: PLParser.FactorExprContext): RawExpr = RawExpr.Binary(
        range = ctx.range,
        operator = BinaryOperator.fromRaw(text = ctx.factorOperator().text),
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitTermExpr(ctx: PLParser.TermExprContext): RawExpr = RawExpr.Binary(
        range = ctx.range,
        operator = BinaryOperator.fromRaw(text = ctx.termOperator().text),
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitComparisonExpr(ctx: PLParser.ComparisonExprContext): RawExpr = RawExpr.Binary(
        range = ctx.range,
        operator = BinaryOperator.fromRaw(text = ctx.comparisonOperator().text),
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitConjunctionExpr(ctx: PLParser.ConjunctionExprContext): RawExpr = RawExpr.Binary(
        range = ctx.range,
        operator = BinaryOperator.AND,
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitDisjunctionExpr(ctx: PLParser.DisjunctionExprContext): RawExpr = RawExpr.Binary(
        range = ctx.range,
        operator = BinaryOperator.OR,
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitIfElseExpr(ctx: PLParser.IfElseExprContext): RawExpr = RawExpr.IfElse(
        range = ctx.range,
        boolExpr = ctx.expression(0).accept(ExprBuilder),
        e1 = ctx.expression(1).accept(ExprBuilder),
        e2 = ctx.expression(2).accept(ExprBuilder)
    )

    override fun visitMatchExpr(ctx: PLParser.MatchExprContext): RawExpr = RawExpr.Match(
        range = ctx.range,
        matchedExpr = ctx.expression().accept(ExprBuilder),
        matchingList = ctx.patternToExpr().map { pattern2Expr ->
            RawExpr.Match.VariantPatternToExpr(
                range = pattern2Expr.range,
                tag = pattern2Expr.UpperId().symbol.rangeWithName,
                dataVariable = pattern2Expr.varOrWildCard().LowerId()?.symbol?.rangeWithName,
                expr = pattern2Expr.expression().accept(ExprBuilder)
            )
        }
    )

    override fun visitFunExpr(ctx: PLParser.FunExprContext): RawExpr = RawExpr.Lambda(
        range = ctx.range,
        arguments = ctx.optionallyAnnotatedParameter().map { oneArg ->
            val posName = oneArg.LowerId().symbol.rangeWithName
            val typeOpt = oneArg.typeAnnotation()?.typeExpr()?.accept(TypeExprBuilder)
            posName to typeOpt
        },
        body = ctx.expression().accept(ExprBuilder)
    )

    override fun visitValExpr(ctx: PLParser.ValExprContext): RawExpr = RawExpr.Val(
        range = ctx.range,
        pattern = ctx.pattern().accept(PatternBuilder),
        typeAnnotation = ctx.typeAnnotation()?.typeExpr()?.accept(TypeExprBuilder),
        assignedExpr = ctx.expression(0).accept(ExprBuilder),
        nextExpr = ctx.expression(1)?.accept(ExprBuilder)
    )

}

