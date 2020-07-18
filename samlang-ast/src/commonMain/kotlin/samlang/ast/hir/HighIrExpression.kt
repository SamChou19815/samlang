package samlang.ast.hir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.BuiltInFunctionName
import samlang.ast.common.UnaryOperator

/** A collection of expressions for common IR. */
sealed class HighIrExpression {
    abstract fun <T> accept(visitor: HighIrExpressionVisitor<T>): T

    object UnitExpression : HighIrExpression() {
        override fun toString(): String = "unit"
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Literal(
        val literal: samlang.ast.common.Literal
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Variable(val name: String) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ClassMember(
        val className: String,
        val memberName: String
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class StructConstructor(
        val expressionList: List<HighIrExpression>
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class VariantConstructor(
        val tag: String,
        val tagOrder: Int,
        val data: HighIrExpression
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class IndexAccess(
        val expression: HighIrExpression,
        val index: Int
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class MethodAccess(
        val expression: HighIrExpression,
        val className: String,
        val methodName: String
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Unary(
        val operator: UnaryOperator,
        val expression: HighIrExpression
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class BuiltInFunctionApplication(
        val functionName: BuiltInFunctionName,
        val argument: HighIrExpression
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FunctionApplication(
        val className: String,
        val functionName: String,
        val arguments: List<HighIrExpression>
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class MethodApplication(
        val objectExpression: HighIrExpression,
        val className: String,
        val methodName: String,
        val arguments: List<HighIrExpression>
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ClosureApplication(
        val functionExpression: HighIrExpression,
        val arguments: List<HighIrExpression>
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Binary(
        val e1: HighIrExpression,
        val operator: BinaryOperator,
        val e2: HighIrExpression
    ) : HighIrExpression() {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Lambda(
        val hasReturn: Boolean,
        val parameters: List<String>,
        val captured: List<String>,
        val body: List<HighIrStatement>
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
