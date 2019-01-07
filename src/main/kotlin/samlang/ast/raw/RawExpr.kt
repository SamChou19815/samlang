package samlang.ast.raw

import samlang.ast.common.BinaryOperator
import samlang.ast.common.UnaryOperator
import samlang.parser.Position

sealed class RawExpr : RawNode {

    /**
     * Accept the visitor of the given [visitor].
     */
    internal abstract fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T

    data class Literal(override val position: Position, val literal: samlang.ast.common.Literal) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class This(override val position: Position) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Variable(override val position: Position, val name: String) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class ModuleMember(
        override val position: Position,
        val moduleName: String,
        val memberName: String
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class TupleConstructor(
        override val position: Position,
        val exprList: List<RawExpr>
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class ObjectConstructor(
        override val position: Position,
        val spreadExpr: RawExpr?,
        val fieldDeclarations: List<FieldConstructor>
    ) : RawExpr() {

        sealed class FieldConstructor {

            abstract val name: Position.WithName

            data class Field(override val name: Position.WithName, val expr: RawExpr) : FieldConstructor()
            data class FieldShorthand(override val name: Position.WithName) : FieldConstructor()
        }

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class VariantConstructor(
        override val position: Position,
        val tag: Position.WithName,
        val data: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class MethodAccess(
        override val position: Position,
        val expr: RawExpr,
        val methodName: Position.WithName
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Unary(
        override val position: Position,
        val operator: UnaryOperator,
        val expr: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Panic(
        override val position: Position,
        val expr: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class FunApp(
        override val position: Position,
        val funExpr: RawExpr,
        val arguments: List<RawExpr>
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Binary(
        override val position: Position,
        val e1: RawExpr,
        val operator: BinaryOperator,
        val e2: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class IfElse(
        override val position: Position,
        val boolExpr: RawExpr,
        val e1: RawExpr,
        val e2: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Match(
        override val position: Position,
        val matchedExpr: RawExpr,
        val matchingList: List<VariantPatternToExpr>
    ) : RawExpr() {

        data class VariantPatternToExpr(
            override val position: Position,
            val tag: Position.WithName,
            val dataVariable: Position.WithName?,
            val expr: RawExpr
        ) : RawNode

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Lambda(
        override val position: Position,
        val arguments: List<Pair<Position.WithName, RawTypeExpr?>>,
        val body: RawExpr
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

    data class Val(
        override val position: Position,
        val pattern: RawPattern,
        val typeAnnotation: RawTypeExpr?,
        val assignedExpr: RawExpr,
        val nextExpr: RawExpr?
    ) : RawExpr() {

        override fun <C, T> accept(visitor: RawExprVisitor<C, T>, context: C): T =
            visitor.visit(expr = this, context = context)

    }

}
