package samlang.ast

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

}
