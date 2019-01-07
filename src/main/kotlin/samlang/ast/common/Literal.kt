package samlang.ast.common

sealed class Literal {

    abstract val prettyPrintedValue: String

    object UnitLiteral : Literal() {

        override val prettyPrintedValue: String = "unit"

    }

    data class IntLiteral(val v: Long) : Literal() {

        override val prettyPrintedValue: String = v.toString()

    }

    data class StringLiteral(val v: String) : Literal() {

        override val prettyPrintedValue: String = "\"$v\""

    }

    data class BoolLiteral(val v: Boolean) : Literal() {

        override val prettyPrintedValue: String = if (v) "true" else "false"

    }

}
