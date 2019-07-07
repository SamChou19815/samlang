package samlang.ast

sealed class Type {

    abstract fun prettyPrint(): String

    abstract infix fun isNotConsistentWith(other: Type): Boolean

    final override fun toString(): String = prettyPrint()

    internal abstract fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T

    /*
     * --------------------------------------------------------------------------------
     * Part 1: Types definable in the surface syntax.
     * --------------------------------------------------------------------------------
     */

    enum class PrimitiveTypeName(val prettyPrintedName: String) {
        UNIT(prettyPrintedName = "unit"),
        BOOL(prettyPrintedName = "bool"),
        INT(prettyPrintedName = "int"),
        STRING(prettyPrintedName = "string")
    }

    data class PrimitiveType(val name: PrimitiveTypeName) : Type() {

        override fun prettyPrint(): String = name.prettyPrintedName

        override fun isNotConsistentWith(other: Type): Boolean = other !is PrimitiveType || name != other.name

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)
    }

    data class IdentifierType(
        val identifier: String,
        val typeArguments: List<Type>?
    ) : Type() {

        override fun prettyPrint(): String = typeArguments
            ?.joinToString(separator = ", ", prefix = "$identifier<", postfix = ">") { it.prettyPrint() }
            ?: identifier

        override fun isNotConsistentWith(other: Type): Boolean {
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

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)

    }


    data class TupleType(val mappings: List<Type>) : Type() {

        override fun prettyPrint(): String =
            mappings.joinToString(separator = " * ", prefix = "[", postfix = "]") { it.prettyPrint() }

        override fun isNotConsistentWith(other: Type): Boolean {
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

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)

    }

    data class FunctionType(
        val argumentTypes: List<Type>,
        val returnType: Type
    ) : Type() {

        override fun prettyPrint(): String {
            val args = argumentTypes.joinToString(separator = ", ", prefix = "(", postfix = ")") { it.prettyPrint() }
            return "$args -> ${returnType.prettyPrint()}"
        }

        override fun isNotConsistentWith(other: Type): Boolean {
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

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)

    }

    /*
     * --------------------------------------------------------------------------------
     * Part 2: Hidden types used mostly for internal representation and implementation.
     * --------------------------------------------------------------------------------
     */

    data class UndecidedType(val index: Int) : Type() {

        override fun prettyPrint(): String = "UNDECIDED_TYPE_$index"

        override fun isNotConsistentWith(other: Type): Boolean =
            other !is UndecidedType || index != other.index

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)

    }

    companion object {

        private var nextUndecidedTypeIndex: Int = 0

        @JvmField
        val unit: PrimitiveType = PrimitiveType(name = PrimitiveTypeName.UNIT)
        @JvmField
        val bool: PrimitiveType = PrimitiveType(name = PrimitiveTypeName.BOOL)
        @JvmField
        val int: PrimitiveType = PrimitiveType(name = PrimitiveTypeName.INT)
        @JvmField
        val string: PrimitiveType = PrimitiveType(name = PrimitiveTypeName.STRING)

        @JvmStatic
        fun undecided(): UndecidedType {
            val type = UndecidedType(
                index = nextUndecidedTypeIndex
            )
            nextUndecidedTypeIndex++
            return type
        }

        @JvmStatic
        fun undecidedList(number: Int): List<UndecidedType> {
            val list = arrayListOf<UndecidedType>()
            for (i in 0 until number) {
                list.add(element = undecided())
            }
            return list
        }

    }

}
