package samlang.compiler.printer

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.checker.ProgramTypeChecker
import samlang.checker.TypeCheckingContext
import samlang.parser.ProgramBuilder
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
        val ctx = TypeCheckingContext.EMPTY
        for ((id, code) in programs) {
            "should consistently print values: $id" {
                val rawProgram1 = ProgramBuilder.buildProgramFromText(text = code)
                val checkedProgram1 = ProgramTypeChecker.typeCheck(program = rawProgram1, ctx = ctx)
                val stream1 = StringPrintStream()
                PrettyPrinter.prettyPrint(program = checkedProgram1, printStream = stream1)
                val prettyCode1 = stream1.printedString
                try {
                    val rawProgram2 = ProgramBuilder.buildProgramFromText(text = prettyCode1)
                    val checkedProgram2 = ProgramTypeChecker.typeCheck(program = rawProgram2, ctx = ctx)
                    val stream2 = StringPrintStream()
                    PrettyPrinter.prettyPrint(program = checkedProgram2, printStream = stream2)
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
