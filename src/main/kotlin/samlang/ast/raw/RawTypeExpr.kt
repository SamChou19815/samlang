package samlang.ast.raw

import samlang.ast.common.Range

sealed class RawTypeExpr() : RawNode {

    internal abstract fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T

    data class UnitType(override val range: Range) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class IntType(override val range: Range) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class StringType(override val range: Range) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class BoolType(override val range: Range) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class IdentifierType(
        override val range: Range,
        val identifier: Range.WithName,
        val typeArgs: List<RawTypeExpr>?
    ) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class TupleType(override val range: Range, val mappings: List<RawTypeExpr>) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class FunctionType(
        override val range: Range,
        val argumentTypes: List<RawTypeExpr>,
        val returnType: RawTypeExpr
    ) : RawTypeExpr() {

        override fun <C, T> accept(visitor: RawTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

}
