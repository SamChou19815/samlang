package samlang.parser

import org.antlr.v4.runtime.ANTLRInputStream
import org.antlr.v4.runtime.CommonTokenStream
import org.apache.commons.text.StringEscapeUtils
import samlang.ast.common.BinaryOperator
import samlang.ast.common.BuiltInFunctionName
import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.UnaryOperator
import samlang.ast.lang.Expression
import samlang.errors.CompileTimeError
import samlang.errors.SyntaxError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser

class ExpressionBuilder internal constructor(
    private val syntaxErrorListener: SyntaxErrorListener
) : PLBaseVisitor<Expression?>() {
    private val statementBlockBuilder: StatementBlockBuilder = StatementBlockBuilder { it.toExpression() }

    private fun PLParser.ExpressionContext.toExpression(): Expression {
        val expression = this.accept(this@ExpressionBuilder)
        if (expression == null) {
            val range = this.range
            val tokenListString = this.children
                ?.joinToString(separator = ", ", prefix = "[", postfix = "]") { it.text }
                ?: "UNABLE_TO_REPRODUCE_TOKENS"
            syntaxErrorListener.addSyntaxError(
                syntaxError = SyntaxError(
                    moduleReference = syntaxErrorListener.moduleReference,
                    range = range,
                    reason = "Cannot build expression with tokens: $tokenListString."
                )
            )
            return dummyExpression(range = range)
        }
        return expression
    }

    override fun visitNestedExpr(ctx: PLParser.NestedExprContext): Expression? = ctx.expression().toExpression()

    override fun visitLiteralExpr(ctx: PLParser.LiteralExprContext): Expression {
        val literalNode = ctx.literal()
        val range = literalNode.range
        // Case TRUE
        literalNode.TRUE()?.let { return Expression.Literal.ofTrue(range = range) }
        // Case FALSE
        literalNode.FALSE()?.let { return Expression.Literal.ofFalse(range = range) }
        // Case MinInt
        literalNode.MinInt()?.let { return Expression.Literal.ofInt(range = range, value = Long.MIN_VALUE) }
        // Case INT
        literalNode.IntLiteral()?.let { node ->
            val token = node.symbol
            val text = token.text
            val intValue = text.toLongOrNull() ?: kotlin.run {
                syntaxErrorListener.addSyntaxError(
                    syntaxError = SyntaxError(
                        moduleReference = syntaxErrorListener.moduleReference,
                        range = token.range,
                        reason = "Not a 64-bit integer."
                    )
                )
                0L
            }
            return Expression.Literal.ofInt(range = range, value = intValue)
        }
        // Case STRING
        literalNode.StrLiteral()?.let {
            return Expression.Literal.ofString(range = range, value = stringLiteralToString(literal = it.text))
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

    override fun visitClassMemberExpr(ctx: PLParser.ClassMemberExprContext): Expression = Expression.ClassMember(
        range = ctx.range,
        type = Type.undecided(),
        typeArguments = emptyList(), // At parsing time, the information is not resolved yet.
        className = ctx.UpperId().symbol.text,
        classNameRange = ctx.UpperId().symbol.range,
        memberName = ctx.LowerId().symbol.text
    )

    override fun visitTupleConstructor(ctx: PLParser.TupleConstructorContext): Expression {
        val range = ctx.range
        val expressionList = ctx.expression().map { it.toExpression() }
        if (expressionList.size > 22) {
            syntaxErrorListener.addSyntaxError(
                syntaxError = SyntaxError(
                    moduleReference = syntaxErrorListener.moduleReference,
                    range = range,
                    reason = "Tuple size exceeds 22."
                )
            )
        }
        val type = TupleType(mappings = expressionList.map { it.type })
        return Expression.TupleConstructor(range = range, type = type, expressionList = expressionList)
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

    override fun visitStringToIntExpr(ctx: PLParser.StringToIntExprContext): Expression =
        Expression.BuiltInFunctionCall(
            range = ctx.range,
            type = Type.int,
            functionName = BuiltInFunctionName.STRING_TO_INT,
            argumentExpression = ctx.expression().toExpression()
        )

    override fun visitIntToStringExpr(ctx: PLParser.IntToStringExprContext): Expression =
        Expression.BuiltInFunctionCall(
            range = ctx.range,
            type = Type.string,
            functionName = BuiltInFunctionName.INT_TO_STRING,
            argumentExpression = ctx.expression().toExpression()
        )

    override fun visitPrintLineExpr(ctx: PLParser.PrintLineExprContext): Expression =
        Expression.BuiltInFunctionCall(
            range = ctx.range,
            type = Type.unit,
            functionName = BuiltInFunctionName.PRINTLN,
            argumentExpression = ctx.expression().toExpression()
        )

    override fun visitFunctionApplicationExpr(ctx: PLParser.FunctionApplicationExprContext): Expression =
        Expression.FunctionApplication(
            range = ctx.range,
            type = Type.undecided(),
            functionExpression = ctx.expression().toExpression(),
            arguments = ctx.functionArguments().expression().map { it.toExpression() }
        )

    override fun visitFactorExpr(ctx: PLParser.FactorExprContext): Expression? {
        val operator = BinaryOperator.fromRaw(text = ctx.factorOperator().text) ?: return null
        val e1 = ctx.expression(0)?.toExpression() ?: return null
        val e2 = ctx.expression(1)?.toExpression() ?: return null
        return Expression.Binary(range = ctx.range, type = Type.int, operator = operator, e1 = e1, e2 = e2)
    }

    override fun visitTermExpr(ctx: PLParser.TermExprContext): Expression? {
        val operator = BinaryOperator.fromRaw(text = ctx.termOperator().text) ?: return null
        val e1 = ctx.expression(0)?.toExpression() ?: return null
        val e2 = ctx.expression(1)?.toExpression() ?: return null
        return Expression.Binary(range = ctx.range, type = Type.int, operator = operator, e1 = e1, e2 = e2)
    }

    override fun visitComparisonExpr(ctx: PLParser.ComparisonExprContext): Expression? {
        val operator = BinaryOperator.fromRaw(text = ctx.comparisonOperator().text) ?: return null
        val e1 = ctx.expression(0)?.toExpression() ?: return null
        val e2 = ctx.expression(1)?.toExpression() ?: return null
        return Expression.Binary(range = ctx.range, type = Type.bool, operator = operator, e1 = e1, e2 = e2)
    }

    override fun visitConjunctionExpr(ctx: PLParser.ConjunctionExprContext): Expression? {
        val e1 = ctx.expression(1)?.toExpression() ?: return null
        val e2 = ctx.expression(1)?.toExpression() ?: return null
        return Expression.Binary(range = ctx.range, type = Type.bool, operator = BinaryOperator.AND, e1 = e1, e2 = e2)
    }

    override fun visitDisjunctionExpr(ctx: PLParser.DisjunctionExprContext): Expression? {
        val e1 = ctx.expression(0)?.toExpression() ?: return null
        val e2 = ctx.expression(1)?.toExpression() ?: return null
        return Expression.Binary(range = ctx.range, type = Type.bool, operator = BinaryOperator.OR, e1 = e1, e2 = e2)
    }

    override fun visitIfElseExpr(ctx: PLParser.IfElseExprContext): Expression? {
        val boolExpression = ctx.expression(0)?.toExpression() ?: return null
        val e1 = ctx.expression(1)?.toExpression() ?: return null
        val e2 = ctx.expression(2)?.toExpression() ?: return null
        return Expression.IfElse(
            range = ctx.range,
            type = Type.undecided(),
            boolExpression = boolExpression,
            e1 = e1,
            e2 = e2
        )
    }

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

    override fun visitFunExpr(ctx: PLParser.FunExprContext): Expression? {
        val arguments = ctx.optionallyAnnotatedParameter().map { oneArg ->
            val nameNode = oneArg.LowerId().symbol
            val name = nameNode.text
            val type = oneArg.typeAnnotation()?.typeExpr()?.accept(TypeBuilder) ?: Type.undecided()
            name to type
        }
        val range = ctx.range
        if (arguments.size > 22) {
            syntaxErrorListener.addSyntaxError(
                syntaxError = SyntaxError(
                    moduleReference = syntaxErrorListener.moduleReference,
                    range = range,
                    reason = "Lambda argument size exceeds 22."
                )
            )
        }
        return Expression.Lambda(
            range = ctx.range,
            type = FunctionType(
                argumentTypes = arguments.map { it.second },
                returnType = Type.undecided()
            ),
            parameters = arguments,
            captured = emptyMap(), // Dummy value. Can only be resolved after type checking.
            body = ctx.expression().toExpression()
        )
    }

    override fun visitStatementBlockExpr(ctx: PLParser.StatementBlockExprContext): Expression? {
        val statementBlock = ctx.statementBlock().accept(statementBlockBuilder) ?: return null
        return Expression.StatementBlockExpression(range = ctx.range, type = Type.undecided(), block = statementBlock)
    }

    companion object {
        fun build(source: String, moduleReference: ModuleReference): Pair<Expression?, List<CompileTimeError>> {
            val parser = PLParser(CommonTokenStream(PLLexer(ANTLRInputStream(source.byteInputStream()))))
            val errorListener = SyntaxErrorListener(moduleReference = moduleReference)
            parser.removeErrorListeners()
            parser.addErrorListener(errorListener)
            val builder = ExpressionBuilder(syntaxErrorListener = errorListener)
            val expression = parser.expression().accept(builder)
            return expression to errorListener.syntaxErrors
        }

        internal fun dummyExpression(range: Range): Expression = Expression.Panic(
            range = range,
            type = Type.undecided(),
            expression = Expression.Literal.ofString(range = range, value = "dummy")
        )

        /** Converts string literal in [literal] to actual string. */
        private fun stringLiteralToString(literal: String): String {
            val firstChar = literal.first()
            val lastChar = literal.last()
            if (firstChar != '"' || lastChar != '"') {
                error(message = "Bad Literal: $literal")
            }
            return StringEscapeUtils.unescapeJava(literal.substring(startIndex = 1, endIndex = literal.length - 1))
        }
    }
}
