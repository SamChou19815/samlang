package samlang.ast.raw

import samlang.parser.Position

sealed class RawTypeExpr() : RawNode {

    internal abstract fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T

    data class UnitType(override val position: Position) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class IntType(override val position: Position) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class StringType(override val position: Position) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class BoolType(override val position: Position) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class IdentifierType(
        override val position: Position,
        val identifier: Position.WithName,
        val typeArgs: List<RawTypeExpr>?
    ) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class TupleType(override val position: Position, val mappings: List<RawTypeExpr>) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class FunctionType(
        override val position: Position,
        val argumentTypes: List<RawTypeExpr>,
        val returnType: RawTypeExpr
    ) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

}
