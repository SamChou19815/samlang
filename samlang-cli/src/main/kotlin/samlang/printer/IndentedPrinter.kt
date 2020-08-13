package samlang.printer

internal class IndentedPrinter(private val indentationSymbol: String) {
    private val builder: StringBuilder = StringBuilder()

    private var disableIndentation: Boolean = false
    private var currentIndentationLevel: Int = 0

    fun printInline(thunk: IndentedPrinter.() -> Unit) {
        if (!disableIndentation) {
            printIndentation()
        }
        val tempDisableIndentation = disableIndentation
        disableIndentation = true
        thunk()
        disableIndentation = tempDisableIndentation
        if (!disableIndentation) {
            builder.append('\n')
        }
    }

    fun indented(thunk: IndentedPrinter.() -> Unit) {
        if (!disableIndentation) {
            currentIndentationLevel++
        }
        thunk()
        if (!disableIndentation) {
            currentIndentationLevel--
        }
    }

    private fun printIndentation() {
        if (!disableIndentation) {
            repeat(times = currentIndentationLevel) { builder.append(indentationSymbol) }
        }
    }

    fun printWithBreak(x: Any): Unit = print(x = x, requireBreak = true)
    fun printWithoutBreak(x: Any): Unit = print(x = x, requireBreak = false)

    private fun print(x: Any, requireBreak: Boolean) {
        printIndentation()
        if (disableIndentation) {
            builder.append(x)
        } else {
            if (requireBreak) {
                builder.append(x).append('\n')
            } else {
                builder.append(x)
            }
        }
    }

    fun dump(): String = builder.toString()
}
