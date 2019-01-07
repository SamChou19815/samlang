package samlang.checker

import io.kotlintest.shouldThrow
import io.kotlintest.specs.StringSpec
import samlang.ast.raw.RawProgram
import samlang.errors.CompileTimeError
import samlang.parser.ProgramBuilder
import samlang.programs.ProgramCollections
import samlang.programs.TestProgramType

class TypeCheckerTest : StringSpec() {

    private val goodPrograms = arrayListOf<Pair<String, RawProgram>>()
    private val badPrograms = arrayListOf<Pair<String, RawProgram>>()

    init {
        ProgramCollections.testPrograms.asSequence()
            .filter { it.type != TestProgramType.BAD_SYNTAX }
            .forEach { (type, id, code) ->
                val r = id to ProgramBuilder.buildProgramFromText(text = code)
                if (type == TestProgramType.GOOD) {
                    goodPrograms.add(element = r)
                } else {
                    badPrograms.add(element = r)
                }
            }
    }

    init {
        for ((id, program) in goodPrograms) {
            "should pass: $id" {
                ProgramTypeChecker.typeCheck(program = program, ctx = TypeCheckingContext.EMPTY)
            }
        }
        for ((id, program) in badPrograms) {
            "should fail: $id" {
                shouldThrow<CompileTimeError> {
                    ProgramTypeChecker.typeCheck(program = program, ctx = TypeCheckingContext.EMPTY)
                }
            }
        }
    }

}
