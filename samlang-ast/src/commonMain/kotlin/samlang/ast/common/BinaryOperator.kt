package samlang.ast.common

/**
 * @property symbol symbol of the operator in this language.
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
enum class BinaryOperator(val symbol: String, val precedence: Int) {

    MUL(symbol = "*", precedence = 0), DIV(symbol = "/", precedence = 0), MOD(symbol = "%", precedence = 0),
    PLUS(symbol = "+", precedence = 1), MINUS(symbol = "-", precedence = 1),
    LT(symbol = "<", precedence = 2), LE(symbol = "<=", precedence = 2),
    GT(symbol = ">", precedence = 2), GE(symbol = ">=", precedence = 2),
    EQ(symbol = "==", precedence = 2), NE(symbol = "!=", precedence = 2),
    AND(symbol = "&&", precedence = 3), OR(symbol = "||", precedence = 4), CONCAT(symbol = "::", precedence = 4);

    companion object {
        /**
         * [symbolTable] is the map that converts a string to the enum value.
         */
        private val symbolTable: Map<String, BinaryOperator> =
            values().asSequence().map { it.symbol to it }.toMap()

        /**
         * [fromRaw] converts a raw string binary operator to the binary operator in the enum mode.
         *
         * @param text the binary operator in the string form.
         * @throws IllegalArgumentException if the given [text] is not a binary operator.
         */
        fun fromRaw(text: String): BinaryOperator? = symbolTable[text]
    }
}
