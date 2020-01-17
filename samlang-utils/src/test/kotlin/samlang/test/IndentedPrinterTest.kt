package samlang.test

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import samlang.util.IndentedPrinter

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
        val stringStream = ByteArrayOutputStream()
        val printer = IndentedPrinter(printStream = PrintStream(stringStream, true), indentationSymbol = "  ")
        printer.printerFunction()
        return stringStream.toString()
    }
}
