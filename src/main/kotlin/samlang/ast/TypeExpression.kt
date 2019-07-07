package samlang.ast

sealed class TypeExpression : Node {

    abstract fun prettyPrint(): String

    abstract infix fun isNotConsistentWith(other: TypeExpression): Boolean

    final override fun toString(): String = prettyPrint()

    internal abstract fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T

    /*
     * --------------------------------------------------------------------------------
     * Part 1: Types definable in the surface syntax.
     * --------------------------------------------------------------------------------
     */

    data class UnitType(override val range: Range) : TypeExpression() {

        override fun prettyPrint(): String = "unit"

        override fun isNotConsistentWith(other: TypeExpression): Boolean = other !is UnitType

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }

    data class IntType(override val range: Range) : TypeExpression() {

        override fun prettyPrint(): String = "int"

        override fun isNotConsistentWith(other: TypeExpression): Boolean = other !is IntType

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }

    data class StringType(override val range: Range) : TypeExpression() {

        override fun prettyPrint(): String = "string"

        override fun isNotConsistentWith(other: TypeExpression): Boolean = other !is StringType

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }

    data class BoolType(override val range: Range) : TypeExpression() {

        override fun prettyPrint(): String = "bool"

        override fun isNotConsistentWith(other: TypeExpression): Boolean = other !is BoolType

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }

    data class IdentifierType(
        override val range: Range,
        val identifier: String,
        val typeArguments: List<TypeExpression>?
    ) : TypeExpression() {

        override fun prettyPrint(): String = typeArguments
            ?.joinToString(separator = ", ", prefix = "$identifier<", postfix = ">") { it.prettyPrint() }
            ?: identifier

        override fun isNotConsistentWith(other: TypeExpression): Boolean {
            if (other !is IdentifierType) {
                return true
            }
            if (identifier != other.identifier) {
                return true
            }
            val thisTypeArguments = typeArguments ?: listOf()
            val otherTypeArgument = other.typeArguments ?: listOf()
            if (thisTypeArguments.size != otherTypeArgument.size) {
                return true
            }
            for (i in 0 until thisTypeArguments.size) {
                if (thisTypeArguments[i] isNotConsistentWith otherTypeArgument[i]) {
                    return true
                }
            }
            return false
        }

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }


    data class TupleType(override val range: Range, val mappings: List<TypeExpression>) : TypeExpression() {

        override fun prettyPrint(): String =
            mappings.joinToString(separator = " * ", prefix = "[", postfix = "]") { it.prettyPrint() }

        override fun isNotConsistentWith(other: TypeExpression): Boolean {
            if (other !is TupleType) {
                return true
            }
            if (mappings.size != other.mappings.size) {
                return true
            }
            for (i in 0 until mappings.size) {
                if (mappings[i] isNotConsistentWith other.mappings[i]) {
                    return true
                }
            }
            return false
        }

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }

    data class FunctionType(
        override val range: Range,
        val argumentTypes: List<TypeExpression>,
        val returnType: TypeExpression
    ) : TypeExpression() {

        override fun prettyPrint(): String {
            val args = argumentTypes.joinToString(separator = ", ", prefix = "(", postfix = ")") { it.prettyPrint() }
            return "$args -> ${returnType.prettyPrint()}"
        }

        override fun isNotConsistentWith(other: TypeExpression): Boolean {
            if (other !is FunctionType) {
                return true
            }
            if (returnType isNotConsistentWith other.returnType) {
                return true
            }
            if (argumentTypes.size != other.argumentTypes.size) {
                return true
            }
            for (i in 0 until argumentTypes.size) {
                if (argumentTypes[i] isNotConsistentWith other.argumentTypes[i]) {
                    return true
                }
            }
            return false
        }

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

    }

    /*
     * --------------------------------------------------------------------------------
     * Part 2: Hidden types used mostly for internal representation and implementation.
     * --------------------------------------------------------------------------------
     */

    data class UndecidedType(override val range: Range, val index: Int) : TypeExpression() {

        override fun prettyPrint(): String = "UNDECIDED_TYPE_$index"

        override fun isNotConsistentWith(other: TypeExpression): Boolean =
            other !is UndecidedType || index != other.index

        override fun <C, T> accept(visitor: TypeExpressionVisitor<C, T>, context: C): T =
            visitor.visit(typeExpression = this, context = context)

        companion object Creator {

            private var nextIndex: Int = 0

            fun create(range: Range): UndecidedType {
                val type = UndecidedType(
                    range = range,
                    index = nextIndex
                )
                nextIndex++
                return type
            }

        }

    }

}
