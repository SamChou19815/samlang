package samlang.ast.common

/**
 * A collection of all supported literals.
 */
sealed class Literal {

    /**
     * A value to be pretty printed.
     */
    abstract val prettyPrintedValue: String

    /**
     * The `unit` literal.
     */
    object UnitLiteral : Literal() {
        override val prettyPrintedValue: String = "unit"
    }

    /**
     * An int literal, like 42.
     */
    data class IntLiteral(val value: Long) : Literal() {
        override val prettyPrintedValue: String = value.toString()
    }

    /**
     * A string literal, like `"Answer to life, universe, and everything"`.
     */
    data class StringLiteral(val value: String) : Literal() {
        override val prettyPrintedValue: String = "\"$value\""
    }

    /**
     * A boolean literal, like `true` or `false`.
     */
    data class BoolLiteral(val value: Boolean) : Literal() {
        override val prettyPrintedValue: String = value.toString()
    }

    companion object {
        @JvmField
        val UNIT: UnitLiteral = UnitLiteral

        @JvmStatic
        fun of(value: Long): IntLiteral = IntLiteral(value = value)

        @JvmStatic
        fun of(value: String): StringLiteral = StringLiteral(value = value)

        @JvmStatic
        fun of(value: Boolean): BoolLiteral = BoolLiteral(value = value)
    }
}
