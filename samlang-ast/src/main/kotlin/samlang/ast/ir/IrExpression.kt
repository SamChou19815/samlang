package samlang.ast.ir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.Literal
import samlang.ast.common.Type
import samlang.ast.common.UnaryOperator

/**
 * A collection of expressions for common IR.
 *
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class IrExpression(val precedence: Int) {

    abstract fun <T> accept(visitor: IrExpressionVisitor<T>): T

    data class Literal(val literal: samlang.ast.common.Literal) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Variable(val name: String) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ClassMember(val className: String, val memberName: String) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class TupleConstructor(val expressionList: List<IrExpression>) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ObjectConstructor(
        val spreadExpression: IrExpression?,
        val fieldDeclaration: List<Pair<String, IrExpression>>
    ) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class VariantConstructor(val tag: String, val data: IrExpression) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FieldAccess(val expression: IrExpression, val fieldName: String) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class MethodAccess(val expression: IrExpression, val methodName: String) : IrExpression(precedence = 2) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Unary(val operator: UnaryOperator, val expression: IrExpression) : IrExpression(precedence = 3) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FunctionApplication(
        val functionExpression: IrExpression,
        val arguments: List<IrExpression>
    ) : IrExpression(precedence = 4) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Binary(
        val e1: IrExpression,
        val operator: BinaryOperator,
        val e2: IrExpression
    ) : IrExpression(precedence = 5 + operator.precedence) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Ternary(
        val boolExpression: IrExpression,
        val e1: IrExpression,
        val e2: IrExpression
    ) : IrExpression(precedence = 10) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Lambda(
        val parameters: List<Pair<String, Type>>,
        val body: List<IrStatement>
    ) : IrExpression(precedence = 11) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    companion object {
        @JvmField
        val UNIT: Literal = Literal(literal = samlang.ast.common.Literal.UnitLiteral)
        @JvmField
        val TRUE: Literal = Literal(literal = samlang.ast.common.Literal.TRUE)
        @JvmField
        val FALSE: Literal = Literal(literal = samlang.ast.common.Literal.FALSE)

        @JvmStatic
        fun literal(value: Long): Literal = Literal(literal = samlang.ast.common.Literal.of(value = value))

        @JvmStatic
        fun literal(value: String): Literal = Literal(literal = samlang.ast.common.Literal.of(value = value))
    }
}
