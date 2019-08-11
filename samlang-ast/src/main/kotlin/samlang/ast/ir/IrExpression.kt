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

    abstract val type: Type

    abstract fun <T> accept(visitor: IrExpressionVisitor<T>): T

    data class Literal(
        override val type: Type,
        val literal: samlang.ast.common.Literal
    ) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Variable(override val type: Type, val name: String) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class This(override val type: Type) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ClassMember(
        override val type: Type,
        val className: String,
        val memberName: String
    ) : IrExpression(precedence = 0) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class TupleConstructor(
        override val type: Type,
        val expressionList: List<IrExpression>
    ) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class ObjectConstructor(
        override val type: Type,
        val spreadExpression: IrExpression?,
        val fieldDeclaration: List<Pair<String, IrExpression>>
    ) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class VariantConstructor(
        override val type: Type,
        val tag: String,
        val data: IrExpression
    ) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FieldAccess(
        override val type: Type,
        val expression: IrExpression,
        val fieldName: String
    ) : IrExpression(precedence = 1) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class MethodAccess(
        override val type: Type,
        val expression: IrExpression,
        val methodName: String
    ) : IrExpression(precedence = 2) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Unary(
        override val type: Type,
        val operator: UnaryOperator,
        val expression: IrExpression
    ) : IrExpression(precedence = 3) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class FunctionApplication(
        override val type: Type,
        val functionExpression: IrExpression,
        val arguments: List<IrExpression>
    ) : IrExpression(precedence = 4) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Binary(
        override val type: Type,
        val e1: IrExpression,
        val operator: BinaryOperator,
        val e2: IrExpression
    ) : IrExpression(precedence = 5 + operator.precedence) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Ternary(
        override val type: Type,
        val boolExpression: IrExpression,
        val e1: IrExpression,
        val e2: IrExpression
    ) : IrExpression(precedence = 10) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
    }

    data class Lambda(
        override val type: Type,
        val parameters: List<Pair<String, Type>>,
        val body: List<IrStatement>
    ) : IrExpression(precedence = 11) {
        override fun <T> accept(visitor: IrExpressionVisitor<T>): T = visitor.visit(expression = this)
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
