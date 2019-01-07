package samlang.compiler.printer

import io.kotlintest.specs.StringSpec
import samlang.checker.ProgramTypeChecker
import samlang.checker.TypeCheckingContext
import samlang.parser.ProgramBuilder
import samlang.programs.ProgramCollections
import samlang.programs.TestProgramType

class PrinterTest : StringSpec() {

    private val programs = ProgramCollections.testPrograms
        .filter { it.type == TestProgramType.GOOD }
        .map { (_, id, code) ->
            val rawProgram = ProgramBuilder.buildProgramFromText(text = code)
            val checkedProgram = ProgramTypeChecker.typeCheck(program = rawProgram, ctx = TypeCheckingContext.EMPTY)
            id to checkedProgram
        }

    init {
        for ((id, program) in programs) {
            "should print values: $id" {
                PrettyPrinter.prettyPrint(program = program, printStream = System.out)
            }
        }
    }

}
