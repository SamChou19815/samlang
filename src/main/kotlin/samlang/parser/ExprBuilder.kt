package samlang.parser

import org.apache.commons.text.StringEscapeUtils
import samlang.ast.common.BinaryOperator
import samlang.ast.common.UnaryOperator
import samlang.ast.common.Literal
import samlang.ast.raw.RawExpr
import samlang.parser.Position.Companion.position
import samlang.parser.Position.Companion.positionWithName
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object ExprBuilder : PLBaseVisitor<RawExpr>() {

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
        // Case INT
        ctx.IntLiteral()?.let { node ->
            val text = node.text
            val intValue = text.toLongOrNull() ?: error(message = "Bad Literal: $text.")
            return Literal.IntLiteral(v = intValue)
        }
        // Case BOOL
        ctx.BoolLiteral()?.let { node ->
            return when (val text = node.text) {
                "true" -> Literal.BoolLiteral(v = true)
                "false" -> Literal.BoolLiteral(v = false)
                else -> error(message = "Bad Literal: $text.")
            }
        }
        // Case STRING
        ctx.StrLiteral()?.let { return Literal.StringLiteral(v = stringLiteralToString(literal = it.text)) }
        error(message = "Bad Literal: $ctx")
    }

    override fun visitLiteralExpr(ctx: PLParser.LiteralExprContext): RawExpr = RawExpr.Literal(
        position = ctx.literal().position,
        literal = buildValue(ctx.literal())
    )

    override fun visitVariableExpr(ctx: PLParser.VariableExprContext): RawExpr = RawExpr.Variable(
        position = ctx.position,
        name = ctx.LowerId().symbol.text
    )

    override fun visitModuleMemberExpr(ctx: PLParser.ModuleMemberExprContext): RawExpr = RawExpr.ModuleMember(
        position = ctx.position,
        moduleName = ctx.UpperId().symbol.text,
        memberName = ctx.LowerId().symbol.text
    )

    override fun visitTupleConstructor(ctx: PLParser.TupleConstructorContext): RawExpr =
        RawExpr.TupleConstructor(
            position = ctx.position,
            exprList = ctx.typeExpr().map { it.accept(ExprBuilder) }
        )

    private object ObjectFieldDeclarationBuilder : PLBaseVisitor<RawExpr.ObjectConstructor.FieldConstructor>() {

        override fun visitNormalObjFieldDeclaration(
            ctx: PLParser.NormalObjFieldDeclarationContext
        ): RawExpr.ObjectConstructor.FieldConstructor = RawExpr.ObjectConstructor.FieldConstructor.Field(
            name = ctx.LowerId().symbol.positionWithName,
            expr = ctx.expression().accept(ExprBuilder)
        )

        override fun visitShorthandObjFieldDeclaration(
            ctx: PLParser.ShorthandObjFieldDeclarationContext
        ): RawExpr.ObjectConstructor.FieldConstructor = RawExpr.ObjectConstructor.FieldConstructor.FieldShorthand(
            name = ctx.LowerId().symbol.positionWithName
        )

    }

    override fun visitObjConstructor(ctx: PLParser.ObjConstructorContext): RawExpr = RawExpr.ObjectConstructor(
        position = ctx.position,
        spreadExpr = ctx.expression()?.accept(ExprBuilder),
        fieldDeclarations = ctx.objectFieldDeclarations().objectFieldDeclaration()
            .map { it.accept(ObjectFieldDeclarationBuilder) }
    )

    override fun visitVariantConstructor(ctx: PLParser.VariantConstructorContext): RawExpr =
        RawExpr.VariantConstructor(
            position = ctx.position,
            tag = ctx.UpperId().symbol.positionWithName,
            data = ctx.expression().accept(ExprBuilder)
        )

    override fun visitMethodAccessExpr(ctx: PLParser.MethodAccessExprContext): RawExpr =
        RawExpr.MethodAccess(
            position = ctx.position,
            expr = ctx.expression().accept(ExprBuilder),
            methodName = ctx.LowerId().symbol.positionWithName
        )

    override fun visitNotExpr(ctx: PLParser.NotExprContext): RawExpr = RawExpr.Unary(
        position = ctx.position,
        operator = UnaryOperator.NOT,
        expr = ctx.expression().accept(ExprBuilder)
    )

    override fun visitNegExpr(ctx: PLParser.NegExprContext): RawExpr = RawExpr.Unary(
        position = ctx.position,
        operator = UnaryOperator.NEG,
        expr = ctx.expression().accept(ExprBuilder)
    )

    override fun visitPanicExpr(ctx: PLParser.PanicExprContext): RawExpr = RawExpr.Panic(
        position = ctx.position,
        expr = ctx.expression().accept(ExprBuilder)
    )

    override fun visitFunctionApplicationExpr(ctx: PLParser.FunctionApplicationExprContext): RawExpr = RawExpr.FunApp(
        position = ctx.position,
        funExpr = ctx.expression().accept(ExprBuilder),
        arguments = ctx.functionArguments().expression().map { it.accept(ExprBuilder) }
    )

    override fun visitFactorExpr(ctx: PLParser.FactorExprContext): RawExpr = RawExpr.Binary(
        position = ctx.position,
        operator = BinaryOperator.fromRaw(text = ctx.factorOperator().text),
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitTermExpr(ctx: PLParser.TermExprContext): RawExpr = RawExpr.Binary(
        position = ctx.position,
        operator = BinaryOperator.fromRaw(text = ctx.termOperator().text),
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitComparisonExpr(ctx: PLParser.ComparisonExprContext): RawExpr = RawExpr.Binary(
        position = ctx.position,
        operator = BinaryOperator.fromRaw(text = ctx.comparisonOperator().text),
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitConjunctionExpr(ctx: PLParser.ConjunctionExprContext): RawExpr = RawExpr.Binary(
        position = ctx.position,
        operator = BinaryOperator.AND,
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitDisjunctionExpr(ctx: PLParser.DisjunctionExprContext): RawExpr = RawExpr.Binary(
        position = ctx.position,
        operator = BinaryOperator.OR,
        e1 = ctx.expression(0).accept(ExprBuilder),
        e2 = ctx.expression(1).accept(ExprBuilder)
    )

    override fun visitIfElseExpr(ctx: PLParser.IfElseExprContext): RawExpr = RawExpr.IfElse(
        position = ctx.position,
        boolExpr = ctx.expression(0).accept(ExprBuilder),
        e1 = ctx.expression(1).accept(ExprBuilder),
        e2 = ctx.expression(2).accept(ExprBuilder)
    )

    override fun visitMatchExpr(ctx: PLParser.MatchExprContext): RawExpr = RawExpr.Match(
        position = ctx.position,
        matchedExpr = ctx.expression().accept(ExprBuilder),
        matchingList = ctx.patternToExpr().map { pattern2Expr ->
            RawExpr.Match.VariantPatternToExpr(
                position = pattern2Expr.position,
                tag = pattern2Expr.UpperId().symbol.positionWithName,
                dataVariable = pattern2Expr.varOrWildCard().LowerId()?.symbol?.positionWithName,
                expr = pattern2Expr.expression().accept(ExprBuilder)
            )
        }
    )

    override fun visitFunExpr(ctx: PLParser.FunExprContext): RawExpr = RawExpr.Lambda(
        position = ctx.position,
        arguments = ctx.optionallyAnnotatedParameter().map { oneArg ->
            val posName = oneArg.LowerId().symbol.positionWithName
            val typeOpt = oneArg.typeAnnotation()?.typeExpr()?.accept(TypeExprBuilder)
            posName to typeOpt
        },
        body = ctx.expression().accept(ExprBuilder)
    )

    override fun visitValExpr(ctx: PLParser.ValExprContext): RawExpr = RawExpr.Val(
        position = ctx.position,
        pattern = ctx.pattern().accept(PatternBuilder),
        typeAnnotation = ctx.typeAnnotation()?.typeExpr()?.accept(TypeExprBuilder),
        assignedExpr = ctx.expression(0).accept(ExprBuilder),
        nextExpr = ctx.expression(1)?.accept(ExprBuilder)
    )

}

