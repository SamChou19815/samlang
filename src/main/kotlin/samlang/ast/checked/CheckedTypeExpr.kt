package samlang.ast.checked

sealed class CheckedTypeExpr {

    abstract fun prettyPrint(): String

    final override fun toString(): String = prettyPrint()

    internal abstract fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T

    /*
     * --------------------------------------------------------------------------------
     * Part 1: Types definable in the surface syntax.
     * --------------------------------------------------------------------------------
     */

    object UnitType : CheckedTypeExpr() {

        override fun prettyPrint(): String = "unit"

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    object IntType : CheckedTypeExpr() {

        override fun prettyPrint(): String = "int"

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    object StringType : CheckedTypeExpr() {

        override fun prettyPrint(): String = "string"

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    object BoolType : CheckedTypeExpr() {

        override fun prettyPrint(): String = "bool"

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class IdentifierType(val identifier: String, val typeArgs: List<CheckedTypeExpr>?) : CheckedTypeExpr() {

        override fun prettyPrint(): String = typeArgs
            ?.joinToString(separator = ", ", prefix = "$identifier<", postfix = ">") { it.prettyPrint() }
            ?: identifier

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }


    data class TupleType(val mappings: List<CheckedTypeExpr>) : CheckedTypeExpr() {

        override fun prettyPrint(): String =
            mappings.joinToString(separator = " * ", prefix = "[", postfix = "]") { it.prettyPrint() }

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    data class FunctionType(
        val argumentTypes: List<CheckedTypeExpr>,
        val returnType: CheckedTypeExpr
    ) : CheckedTypeExpr() {

        override fun prettyPrint(): String {
            val args = argumentTypes.joinToString(separator = ", ", prefix = "(", postfix = ")") { it.prettyPrint() }
            return "$args -> ${returnType.prettyPrint()}"
        }

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    /*
     * --------------------------------------------------------------------------------
     * Part 2: Hidden types used mostly for internal representation and implementation.
     * --------------------------------------------------------------------------------
     */

    data class UndecidedType(val index: Int) : CheckedTypeExpr() {

        override fun prettyPrint(): String = "UNDECIDED_TYPE_$index"

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)

    }

    object FreeType : CheckedTypeExpr() {

        override fun prettyPrint(): String = error(message = "You are not supposed to print this.")

        override fun <C, T> accept(visitor: CheckedTypeExprVisitor<C, T>, context: C): T =
            visitor.visit(typeExpr = this, context = context)
    }

}
