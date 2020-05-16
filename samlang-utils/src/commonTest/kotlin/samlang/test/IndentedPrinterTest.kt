package samlang.test

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.util.IndentedPrinter
import samlang.util.StringBuilderPrintDevice

class IndentedPrinterTest {
    @Test
    fun basicTests() {
        val result = printToString {
            printWithBreak(x = "foo")
            indented {
                printWithBreak(x = "bar")
                printWithBreak(x = "haha")
                printInline {
                    indented {
                        printWithBreak(x = "foo")
                        printWithBreak(x = "bar")
                    }
                }
            }
            printWithBreak(x = "baz")
        }
        val expectedResult = """
            foo
              bar
              haha
              foobar
            baz

        """.trimIndent()
        assertEquals(expected = expectedResult, actual = result)
    }

    private fun printToString(printerFunction: IndentedPrinter.() -> Unit): String {
        val device = StringBuilderPrintDevice()
        val printer = IndentedPrinter(device = device, indentationSymbol = "  ")
        printer.printerFunction()
        return device.dump()
    }
}
