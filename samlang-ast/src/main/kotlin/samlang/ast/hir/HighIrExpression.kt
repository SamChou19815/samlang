package samlang.ast.hir

import samlang.ast.common.IrOperator

/** A collection of expressions for common IR. */
sealed class HighIrExpression {
    abstract fun <T> accept(visitor: HighIrExpressionVisitor<T>): T

    data class IntLiteral(val value: Long) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class StringLiteral(val value: String) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Name(val name: String) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Variable(val name: String) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class IndexAccess(
        val expression: HighIrExpression,
        val index: Int
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Binary(
        val e1: HighIrExpression,
        val operator: IrOperator,
        val e2: HighIrExpression
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    companion object {
        val ZERO: IntLiteral = IntLiteral(value = 0)
    }
}
