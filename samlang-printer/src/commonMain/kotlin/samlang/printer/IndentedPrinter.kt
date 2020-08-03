package samlang.printer

internal class IndentedPrinter(private val device: StringBuilderPrintDevice, private val indentationSymbol: String) {

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
            device.println()
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
            repeat(times = currentIndentationLevel) { device.print(indentationSymbol) }
        }
    }

    fun printWithBreak(x: Any): Unit = print(x = x, requireBreak = true)
    fun printWithoutBreak(x: Any): Unit = print(x = x, requireBreak = false)

    private fun print(x: Any, requireBreak: Boolean) {
        printIndentation()
        if (disableIndentation) {
            device.print(x)
        } else {
            if (requireBreak) {
                device.println(x)
            } else {
                device.print(x)
            }
        }
    }
}
