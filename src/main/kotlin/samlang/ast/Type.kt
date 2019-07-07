package samlang.ast

sealed class Type : Node {

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

    data class PrimitiveType(override val range: Range, val name: PrimitiveTypeName) : Type() {

        override fun prettyPrint(): String = name.prettyPrintedName

        override fun isNotConsistentWith(other: Type): Boolean = other !is PrimitiveType || name != other.name

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)
    }

    data class IdentifierType(
        override val range: Range,
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


    data class TupleType(override val range: Range, val mappings: List<Type>) : Type() {

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
        override val range: Range,
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

    data class UndecidedType(override val range: Range, val index: Int) : Type() {

        override fun prettyPrint(): String = "UNDECIDED_TYPE_$index"

        override fun isNotConsistentWith(other: Type): Boolean =
            other !is UndecidedType || index != other.index

        override fun <C, T> accept(visitor: TypeVisitor<C, T>, context: C): T =
            visitor.visit(type = this, context = context)

    }

    companion object {

        private var nextUndecidedTypeIndex: Int = 0

        fun unit(range: Range): PrimitiveType = PrimitiveType(range = range, name = PrimitiveTypeName.UNIT)
        fun bool(range: Range): PrimitiveType = PrimitiveType(range = range, name = PrimitiveTypeName.BOOL)
        fun int(range: Range): PrimitiveType = PrimitiveType(range = range, name = PrimitiveTypeName.INT)
        fun string(range: Range): PrimitiveType = PrimitiveType(range = range, name = PrimitiveTypeName.STRING)

        fun isUnit(type: Type): Boolean = type is PrimitiveType && type.name == PrimitiveTypeName.UNIT
        fun isBool(type: Type): Boolean = type is PrimitiveType && type.name == PrimitiveTypeName.BOOL
        fun isInt(type: Type): Boolean = type is PrimitiveType && type.name == PrimitiveTypeName.INT
        fun isString(type: Type): Boolean = type is PrimitiveType && type.name == PrimitiveTypeName.STRING

        fun undecided(range: Range): UndecidedType {
            val type = UndecidedType(
                range = range,
                index = nextUndecidedTypeIndex
            )
            nextUndecidedTypeIndex++
            return type
        }

        fun undecidedList(number: Int, range: Range): List<UndecidedType> {
            val list = arrayListOf<UndecidedType>()
            for (i in 0 until number) {
                list.add(element = undecided(range = range))
            }
            return list
        }

    }

}
