package samlang.ast.hir

/**
 * A collection of statements for common IR.
 */
sealed class HighIrStatement {

    abstract fun <T> accept(visitor: HighIrStatementVisitor<T>): T

    data class Throw(val expression: HighIrExpression) : HighIrStatement() {
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
        val assignedTemporaryVariable: String?,
        val variableForMatchedExpression: String,
        val matchingList: List<VariantPatternToStatement>
    ) : HighIrStatement() {

        data class VariantPatternToStatement(
            val tag: String,
            val tagOrder: Int,
            val dataVariable: String?,
            val statements: List<HighIrStatement>,
            val finalExpression: HighIrExpression?
        )

        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class LetDeclaration(val name: String) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class VariableAssignment(val name: String, val assignedExpression: HighIrExpression) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class ConstantDefinition(val name: String, val assignedExpression: HighIrExpression) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class ExpressionAsStatement(val expressionWithPotentialSideEffect: HighIrExpression) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Return(val expression: HighIrExpression?) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Block(val statements: List<HighIrStatement>) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }
}
