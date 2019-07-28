package samlang.printer

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.common.getTypeCheckedModule
import samlang.programs.testPrograms
import java.io.OutputStream
import java.io.PrintStream

class PrinterTest : StringSpec() {

    private val programs: List<Pair<String, String>> = testPrograms
        .filter { it.errorSet.isEmpty() }
        .map { (id, _, code) ->
            id to code
        }

    private class StringPrintStream : PrintStream(StringBuilderOutputStream(), true) {

        private class StringBuilderOutputStream : OutputStream() {

            val sb = StringBuilder()

            override fun write(b: Int) {
                sb.append(b.toChar())
            }
        }

        val printedString: String get() = (out as StringBuilderOutputStream).sb.toString()
    }

    init {
        for ((id, code) in programs) {
            "should consistently print values: $id" {
                val program1 = getTypeCheckedModule(code = code)
                val stream1 = StringPrintStream()
                PrettyPrinter.prettyPrint(module = program1, printStream = stream1)
                val prettyCode1 = stream1.printedString
                try {
                    val program2 = getTypeCheckedModule(code = prettyCode1)
                    val stream2 = StringPrintStream()
                    PrettyPrinter.prettyPrint(module = program2, printStream = stream2)
                    val prettyCode2 = stream1.printedString
                    prettyCode1 shouldBe prettyCode2
                    println(prettyCode2)
                } catch (e: RuntimeException) {
                    println(prettyCode1)
                    throw e
                }
            }
        }
    }
}
