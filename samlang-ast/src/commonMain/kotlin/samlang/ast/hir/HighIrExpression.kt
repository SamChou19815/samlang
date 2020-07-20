package samlang.ast.hir

import samlang.ast.common.IrOperator

/** A collection of expressions for common IR. */
sealed class HighIrExpression {
    abstract fun <T> accept(visitor: HighIrExpressionVisitor<T>): T

    data class Literal(
        val literal: samlang.ast.common.Literal
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Variable(val name: String) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class StructConstructor(
        val expressionList: List<HighIrExpression>
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class IndexAccess(
        val expression: HighIrExpression,
        val index: Int
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FunctionClosure(
        val closureContextExpression: HighIrExpression,
        val encodedFunctionName: String
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
        val TRUE: Literal = Literal(literal = samlang.ast.common.Literal.TRUE)
        val FALSE: Literal = Literal(literal = samlang.ast.common.Literal.FALSE)

        fun literal(value: Long): Literal =
            Literal(literal = samlang.ast.common.Literal.of(value = value))

        fun literal(value: String): Literal =
            Literal(literal = samlang.ast.common.Literal.of(value = value))
    }
}
