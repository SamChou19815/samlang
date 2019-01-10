package samlang.checker

import io.kotlintest.shouldThrow
import io.kotlintest.specs.StringSpec
import samlang.errors.CompileTimeError
import samlang.parser.ProgramBuilder
import samlang.programs.ProgramCollections
import samlang.programs.TestProgramType

class TypeCheckerTest : StringSpec() {

    private val goodPrograms = arrayListOf<Pair<String, String>>()
    private val badPrograms = arrayListOf<Pair<String, String>>()

    init {
        ProgramCollections.testPrograms.asSequence()
            .filter { it.type != TestProgramType.BAD_SYNTAX }
            .forEach { (type, id, code) ->
                val r = id to code
                if (type == TestProgramType.GOOD) {
                    goodPrograms.add(element = r)
                } else {
                    badPrograms.add(element = r)
                }
            }
    }

    init {
        for ((id, code) in goodPrograms) {
            "should pass: $id" {
                val program = ProgramBuilder.buildProgramFromText(text = code)
                ProgramTypeChecker.typeCheck(program = program, ctx = TypeCheckingContext.EMPTY)
            }
        }
        for ((id, code) in badPrograms) {
            "should fail: $id" {
                shouldThrow<CompileTimeError> {
                    val program = ProgramBuilder.buildProgramFromText(text = code)
                    ProgramTypeChecker.typeCheck(program = program, ctx = TypeCheckingContext.EMPTY)
                }
            }
        }
    }

}
