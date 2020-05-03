package samlang.test

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.util.IndentedPrinter
import samlang.util.StringBuilderPrintDevice

class IndentedPrinterTest : StringSpec() {
    init {
        "indented printer works" {
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
            result shouldBe """
                foo
                  bar
                  haha
                  foobar
                baz
                
            """.trimIndent()
        }
    }

    private fun printToString(printerFunction: IndentedPrinter.() -> Unit): String {
        val device = StringBuilderPrintDevice()
        val printer = IndentedPrinter(device = device, indentationSymbol = "  ")
        printer.printerFunction()
        return device.dump()
    }
}
