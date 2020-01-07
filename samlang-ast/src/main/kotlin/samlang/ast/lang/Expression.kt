package samlang.ast.lang

import samlang.ast.common.BinaryOperator
import samlang.ast.common.Node
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.UnaryOperator

/**
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class Expression(val precedence: Int) : Node {

    abstract val type: Type

    /**
     * Accept the visitor of the given [visitor].
     */
    abstract fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T

    data class Literal(
        override val range: Range,
        override val type: Type,
        val literal: samlang.ast.common.Literal
    ) : Expression(precedence = 0) {

        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)

        companion object {
            fun ofUnit(range: Range): Literal =
                Literal(range = range, type = Type.unit, literal = samlang.ast.common.Literal.UnitLiteral)

            fun ofTrue(range: Range): Literal =
                Literal(range = range, type = Type.bool, literal = samlang.ast.common.Literal.TRUE)

            fun ofFalse(range: Range): Literal =
                Literal(range = range, type = Type.bool, literal = samlang.ast.common.Literal.FALSE)

            fun ofInt(range: Range, value: Long): Literal =
                Literal(range = range, type = Type.int, literal = samlang.ast.common.Literal.of(value = value))

            fun ofString(range: Range, value: String): Literal =
                Literal(range = range, type = Type.string, literal = samlang.ast.common.Literal.of(value = value))
        }
    }

    data class This(override val range: Range, override val type: Type) : Expression(precedence = 0) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Variable(
        override val range: Range,
        override val type: Type,
        val name: String
    ) : Expression(precedence = 0) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class ClassMember(
        override val range: Range,
        override val type: Type,
        val typeArguments: List<Type>,
        val className: String,
        val classNameRange: Range,
        val memberName: String
    ) : Expression(precedence = 0) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class TupleConstructor(
        override val range: Range,
        override val type: Type.TupleType,
        val expressionList: List<Expression>
    ) : Expression(precedence = 1) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class ObjectConstructor(
        override val range: Range,
        override val type: Type,
        val spreadExpression: Expression?,
        val fieldDeclarations: List<FieldConstructor>
    ) : Expression(precedence = 1) {
        sealed class FieldConstructor {
            abstract val range: Range
            abstract val type: Type
            abstract val name: String

            abstract fun copyWithNewType(type: Type): FieldConstructor

            data class Field(
                override val range: Range,
                override val type: Type,
                override val name: String,
                val expression: Expression
            ) : FieldConstructor() {
                override fun copyWithNewType(type: Type): FieldConstructor = copy(type = type)
            }

            data class FieldShorthand(
                override val range: Range,
                override val type: Type,
                override val name: String
            ) : FieldConstructor() {
                override fun copyWithNewType(type: Type): FieldConstructor = copy(type = type)
            }
        }

        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class VariantConstructor(
        override val range: Range,
        override val type: Type,
        val tag: String,
        val data: Expression
    ) : Expression(precedence = 1) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class FieldAccess(
        override val range: Range,
        override val type: Type,
        val expression: Expression,
        val fieldName: String
    ) : Expression(precedence = 1) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class MethodAccess(
        override val range: Range,
        override val type: Type,
        val expression: Expression,
        val methodName: String
    ) : Expression(precedence = 2) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Unary(
        override val range: Range,
        override val type: Type,
        val operator: UnaryOperator,
        val expression: Expression
    ) : Expression(precedence = 3) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Panic(
        override val range: Range,
        override val type: Type,
        val expression: Expression
    ) : Expression(precedence = 3) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class FunctionApplication(
        override val range: Range,
        override val type: Type,
        val functionExpression: Expression,
        val arguments: List<Expression>
    ) : Expression(precedence = 4) {

        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Binary(
        override val range: Range,
        override val type: Type,
        val e1: Expression,
        val operator: BinaryOperator,
        val e2: Expression
    ) : Expression(precedence = 5 + operator.precedence) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class IfElse(
        override val range: Range,
        override val type: Type,
        val boolExpression: Expression,
        val e1: Expression,
        val e2: Expression
    ) : Expression(precedence = 10) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Match(
        override val range: Range,
        override val type: Type,
        val matchedExpression: Expression,
        val matchingList: List<VariantPatternToExpr>
    ) : Expression(precedence = 11) {
        data class VariantPatternToExpr(
            val range: Range,
            val tag: String,
            val dataVariable: String?,
            val expression: Expression
        )

        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Lambda(
        override val range: Range,
        override val type: Type.FunctionType,
        val parameters: List<Pair<String, Type>>,
        val body: Expression
    ) : Expression(precedence = 12) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class StatementBlockExpression(
        override val range: Range,
        override val type: Type,
        val block: StatementBlock
    ) : Expression(precedence = 0) {
        override fun <C, T> accept(visitor: ExpressionVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }
}
