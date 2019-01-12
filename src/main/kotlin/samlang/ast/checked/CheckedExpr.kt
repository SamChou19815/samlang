package samlang.ast.checked

import samlang.ast.common.BinaryOperator
import samlang.ast.common.UnaryOperator

/**
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class CheckedExpr(val precedence: Int) {

    abstract val type: CheckedTypeExpr

    /**
     * Accept the visitor of the given [visitor].
     */
    internal abstract fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T

    data class Literal(
        override val type: CheckedTypeExpr,
        val literal: samlang.ast.common.Literal
    ) : CheckedExpr(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class This(override val type: CheckedTypeExpr) : CheckedExpr(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Variable(
        override val type: CheckedTypeExpr,
        val name: String
    ) : CheckedExpr(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class ModuleMember(
        override val type: CheckedTypeExpr,
        val moduleName: String,
        val memberName: String
    ) : CheckedExpr(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class TupleConstructor(
        override val type: CheckedTypeExpr.TupleType,
        val exprList: List<CheckedExpr>
    ) : CheckedExpr(precedence = 1) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class ObjectConstructor(
        override val type: CheckedTypeExpr.IdentifierType,
        val spreadExpr: CheckedExpr?,
        val fieldDeclarations: List<FieldConstructor>
    ) : CheckedExpr(precedence = 1) {

        sealed class FieldConstructor {

            abstract val type: CheckedTypeExpr
            abstract val name: String

            abstract fun copyWithNewType(type: CheckedTypeExpr): FieldConstructor

            data class Field(
                override val type: CheckedTypeExpr,
                override val name: String,
                val expr: CheckedExpr
            ) : FieldConstructor() {

                override fun copyWithNewType(type: CheckedTypeExpr): FieldConstructor = copy(type = type)

            }

            data class FieldShorthand(
                override val type: CheckedTypeExpr,
                override val name: String
            ) : FieldConstructor() {

                override fun copyWithNewType(type: CheckedTypeExpr): FieldConstructor = copy(type = type)

            }

        }

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class VariantConstructor(
        override val type: CheckedTypeExpr.IdentifierType,
        val tag: String,
        val data: CheckedExpr
    ) : CheckedExpr(precedence = 1) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class FieldAccess(
        override val type: CheckedTypeExpr,
        val expr: CheckedExpr,
        val fieldName: String
    ) : CheckedExpr(precedence = 1) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class MethodAccess(
        override val type: CheckedTypeExpr.FunctionType,
        val expr: CheckedExpr,
        val methodName: String
    ) : CheckedExpr(precedence = 2) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Unary(
        override val type: CheckedTypeExpr,
        val operator: UnaryOperator,
        val expr: CheckedExpr
    ) : CheckedExpr(precedence = 3) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Panic(
        override val type: CheckedTypeExpr,
        val expr: CheckedExpr
    ) : CheckedExpr(precedence = 3) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class FunApp(
        override val type: CheckedTypeExpr,
        val funExpr: CheckedExpr,
        val arguments: List<CheckedExpr>
    ) : CheckedExpr(precedence = 4) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Binary(
        override val type: CheckedTypeExpr,
        val e1: CheckedExpr,
        val operator: BinaryOperator,
        val e2: CheckedExpr
    ) : CheckedExpr(precedence = 5 + operator.precedence) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class IfElse(
        override val type: CheckedTypeExpr,
        val boolExpr: CheckedExpr,
        val e1: CheckedExpr,
        val e2: CheckedExpr
    ) : CheckedExpr(precedence = 10) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Match(
        override val type: CheckedTypeExpr,
        val matchedExpr: CheckedExpr,
        val matchingList: List<VariantPatternToExpr>
    ) : CheckedExpr(precedence = 11) {

        data class VariantPatternToExpr(val tag: String, val dataVariable: String?, val expr: CheckedExpr)

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Lambda(
        override val type: CheckedTypeExpr.FunctionType,
        val arguments: List<Pair<String, CheckedTypeExpr>>,
        val body: CheckedExpr
    ) : CheckedExpr(precedence = 12) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Val(
        override val type: CheckedTypeExpr,
        val pattern: CheckedPattern,
        val assignedExpr: CheckedExpr,
        val nextExpr: CheckedExpr?
    ) : CheckedExpr(precedence = 13) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

}
