package samlang.parser

import samlang.ast.common.Type
import samlang.ast.lang.Expression
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal class StatementBlockBuilder(
    private val expressionBuilder: (PLParser.ExpressionContext) -> Expression
) : PLBaseVisitor<StatementBlock?>() {
    private val statementBuilder: StatementBuilder = StatementBuilder()

    override fun visitStatementBlock(ctx: PLParser.StatementBlockContext): StatementBlock? =
        StatementBlock(
            range = ctx.range,
            statements = ctx.statement().mapNotNull { it.accept(statementBuilder) },
            expression = ctx.expression()?.let(block = expressionBuilder)
        )

    private inner class StatementBuilder : PLBaseVisitor<Statement?>() {

        override fun visitValStatement(ctx: PLParser.ValStatementContext): Statement? {
            val pattern = ctx.pattern()?.let { patternContext ->
                patternContext.accept(PatternBuilder) ?: Pattern.WildCardPattern(range = patternContext.range)
            } ?: return null
            val typeAnnotation = ctx.typeAnnotation()?.typeExpr()?.accept(TypeBuilder) ?: Type.undecided()
            val expression = ctx.expression()?.let(block = expressionBuilder) ?: return null
            return Statement.Val(
                range = ctx.range,
                pattern = pattern,
                typeAnnotation = typeAnnotation,
                assignedExpression = expression
            )
        }
    }
}
