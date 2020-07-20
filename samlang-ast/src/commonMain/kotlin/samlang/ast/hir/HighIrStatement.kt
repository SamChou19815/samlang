package samlang.ast.hir

/**
 * A collection of statements for common IR.
 */
sealed class HighIrStatement {

    abstract fun <T> accept(visitor: HighIrStatementVisitor<T>): T

    data class FunctionApplication(
        val functionName: String,
        val arguments: List<HighIrExpression>,
        val resultCollector: String
    ) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class ClosureApplication(
        val functionExpression: HighIrExpression,
        val arguments: List<HighIrExpression>,
        val resultCollector: String
    ) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class IfElse(
        val booleanExpression: HighIrExpression,
        val s1: List<HighIrStatement>,
        val s2: List<HighIrStatement>
    ) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Match(
        val assignedTemporaryVariable: String,
        val variableForMatchedExpression: String,
        val matchingList: List<VariantPatternToStatement>
    ) : HighIrStatement() {

        data class VariantPatternToStatement(
            val tagOrder: Int,
            val dataVariable: String?,
            val statements: List<HighIrStatement>,
            val finalExpression: HighIrExpression
        )

        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class LetDefinition(val name: String, val assignedExpression: HighIrExpression) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class ExpressionAsStatement(val expressionWithPotentialSideEffect: HighIrExpression) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Return(val expression: HighIrExpression?) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }
}
