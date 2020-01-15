package samlang.util

import java.io.PrintStream

class IndentedPrinter(private val printStream: PrintStream, private val indentationSymbol: String) {

    private var disableIndentation: Boolean = false
    private var currentIndentationLevel: Int = 0

    fun printlnWithoutFurtherIndentation(thunk: IndentedPrinter.() -> Unit) {
        if (!disableIndentation) {
            printIndentation()
        }
        val tempDisableIndentation = disableIndentation
        disableIndentation = true
        thunk()
        disableIndentation = tempDisableIndentation
        if (!disableIndentation) {
            printStream.println()
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
            repeat(times = currentIndentationLevel) { printStream.print(indentationSymbol) }
        }
    }

    private fun print(x: Any, requireBreak: Boolean) {
        printIndentation()
        if (disableIndentation) {
            printStream.print(x)
            if (requireBreak) {
                printStream.print(' ')
            }
        } else {
            if (requireBreak) {
                printStream.println(x)
            } else {
                printStream.print(x)
            }
        }
    }

    fun printWithBreak(x: Any): Unit = print(x = x, requireBreak = true)

    fun printWithoutBreak(x: Any): Unit = print(x = x, requireBreak = false)

    fun println() {
        if (disableIndentation) {
            printStream.print(' ')
        } else {
            printStream.println()
        }
    }
}
