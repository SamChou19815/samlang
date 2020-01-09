package samlang.ast.hir

import samlang.ast.common.Type

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
        val type: Type,
        val assignedTemporaryVariable: String?,
        val variableForMatchedExpression: String,
        val variableForMatchedExpressionType: Type.IdentifierType,
        val matchingList: List<VariantPatternToStatement>
    ) : HighIrStatement() {

        data class VariantPatternToStatement(
            val tag: String,
            val dataVariable: String?,
            val statements: List<HighIrStatement>,
            val finalExpression: HighIrExpression?
        )

        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class LetDeclaration(val name: String, val typeAnnotation: Type) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class VariableAssignment(val name: String, val assignedExpression: HighIrExpression) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class ConstantDefinition(
        val pattern: HighIrPattern,
        val typeAnnotation: Type,
        val assignedExpression: HighIrExpression
    ) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Return(val expression: HighIrExpression?) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Block(val statements: List<HighIrStatement>) : HighIrStatement() {
        override fun <T> accept(visitor: HighIrStatementVisitor<T>): T = visitor.visit(statement = this)
    }
}
