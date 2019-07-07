package samlang.ast.raw

import samlang.ast.common.BinaryOperator
import samlang.ast.common.UnaryOperator
import samlang.ast.common.Range

sealed class RawExpr : RawNode {

    /**
     * Accept the visitor of the given [visitor].
     */
    internal abstract fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T

    data class Literal(override val range: Range, val literal: samlang.ast.common.Literal) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class This(override val range: Range) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Variable(override val range: Range, val name: String) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class ModuleMember(
        override val range: Range,
        val moduleName: String,
        val memberName: String
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class TupleConstructor(
        override val range: Range,
        val exprList: List<RawExpr>
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class ObjectConstructor(
        override val range: Range,
        val spreadExpr: RawExpr?,
        val fieldDeclarations: List<FieldConstructor>
    ) : RawExpr() {

        sealed class FieldConstructor {

            abstract val name: Range.WithName

            data class Field(override val name: Range.WithName, val expr: RawExpr) : FieldConstructor()
            data class FieldShorthand(override val name: Range.WithName) : FieldConstructor()
        }

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class VariantConstructor(
        override val range: Range,
        val tag: Range.WithName,
        val data: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class FieldAccess(
        override val range: Range,
        val expr: RawExpr,
        val fieldName: Range.WithName
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class MethodAccess(
        override val range: Range,
        val expr: RawExpr,
        val methodName: Range.WithName
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Unary(
        override val range: Range,
        val operator: UnaryOperator,
        val expr: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Panic(
        override val range: Range,
        val expr: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class FunApp(
        override val range: Range,
        val funExpr: RawExpr,
        val arguments: List<RawExpr>
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Binary(
        override val range: Range,
        val e1: RawExpr,
        val operator: BinaryOperator,
        val e2: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class IfElse(
        override val range: Range,
        val boolExpr: RawExpr,
        val e1: RawExpr,
        val e2: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Match(
        override val range: Range,
        val matchedExpr: RawExpr,
        val matchingList: List<VariantPatternToExpr>
    ) : RawExpr() {

        data class VariantPatternToExpr(
            override val range: Range,
            val tag: Range.WithName,
            val dataVariable: Range.WithName?,
            val expr: RawExpr
        ) : RawNode

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Lambda(
        override val range: Range,
        val arguments: List<Pair<Range.WithName, RawTypeExpr?>>,
        val body: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Val(
        override val range: Range,
        val pattern: RawPattern,
        val typeAnnotation: RawTypeExpr?,
        val assignedExpr: RawExpr,
        val nextExpr: RawExpr?
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

}
