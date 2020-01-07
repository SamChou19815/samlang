package samlang.ast.hir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.Type
import samlang.ast.common.UnaryOperator

/**
 * A collection of expressions for common IR.
 *
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class HighIrExpression(val precedence: Int) {

    abstract val type: Type

    abstract fun <T> accept(visitor: HighIrExpressionVisitor<T>): T

    object Never : HighIrExpression(precedence = 0) {
        override val type: Type get() = error(message = "Never supposed to be queried.")
        override fun toString(): String = "NEVER"
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Literal(
        override val type: Type,
        val literal: samlang.ast.common.Literal
    ) : HighIrExpression(precedence = 0) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Variable(override val type: Type, val name: String) : HighIrExpression(precedence = 0) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class This(override val type: Type) : HighIrExpression(precedence = 0) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ClassMember(
        override val type: Type,
        val typeArguments: List<Type>,
        val className: String,
        val memberName: String
    ) : HighIrExpression(precedence = 0) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class TupleConstructor(
        override val type: Type,
        val expressionList: List<HighIrExpression>
    ) : HighIrExpression(precedence = 1) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ObjectConstructor(
        override val type: Type.IdentifierType,
        val spreadExpression: HighIrExpression?,
        val fieldDeclaration: List<Pair<String, HighIrExpression>>
    ) : HighIrExpression(precedence = 1) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class VariantConstructor(
        override val type: Type.IdentifierType,
        val tag: String,
        val data: HighIrExpression
    ) : HighIrExpression(precedence = 1) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FieldAccess(
        override val type: Type,
        val expression: HighIrExpression,
        val fieldName: String
    ) : HighIrExpression(precedence = 1) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class MethodAccess(
        override val type: Type,
        val expression: HighIrExpression,
        val methodName: String
    ) : HighIrExpression(precedence = 2) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Unary(
        override val type: Type,
        val operator: UnaryOperator,
        val expression: HighIrExpression
    ) : HighIrExpression(precedence = 3) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FunctionApplication(
        override val type: Type,
        val functionExpression: HighIrExpression,
        val arguments: List<HighIrExpression>
    ) : HighIrExpression(precedence = 4) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Binary(
        override val type: Type,
        val e1: HighIrExpression,
        val operator: BinaryOperator,
        val e2: HighIrExpression
    ) : HighIrExpression(precedence = 5 + operator.precedence) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Ternary(
        override val type: Type,
        val boolExpression: HighIrExpression,
        val e1: HighIrExpression,
        val e2: HighIrExpression
    ) : HighIrExpression(precedence = 10) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Lambda(
        override val type: Type.FunctionType,
        val parameters: List<Pair<String, Type>>,
        val body: List<HighIrStatement>
    ) : HighIrExpression(precedence = 11) {
        override fun <T> accept(visitor: HighIrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    companion object {
        @JvmField
        val UNIT: Literal = Literal(type = Type.unit, literal = samlang.ast.common.Literal.UnitLiteral)
        @JvmField
        val TRUE: Literal = Literal(type = Type.bool, literal = samlang.ast.common.Literal.TRUE)
        @JvmField
        val FALSE: Literal = Literal(type = Type.bool, literal = samlang.ast.common.Literal.FALSE)

        @JvmStatic
        fun literal(value: Long): Literal =
            Literal(type = Type.int, literal = samlang.ast.common.Literal.of(value = value))

        @JvmStatic
        fun literal(value: String): Literal =
            Literal(type = Type.string, literal = samlang.ast.common.Literal.of(value = value))
    }
}
