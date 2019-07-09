package samlang.checker

import io.kotlintest.fail
import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.errors.CompileTimeError
import samlang.parser.ProgramBuilder
import samlang.programs.testPrograms

class TypeCheckerTest : StringSpec() {

    init {
        for ((id, errorSet, code) in testPrograms) {
            if (errorSet.isEmpty()) {
                "should have no errors: $id" {
                    val program = ProgramBuilder.buildProgramFromText(text = code)
                    ProgramTypeChecker.typeCheck(program = program, ctx = TypeCheckingContext.EMPTY)
                }
            } else {
                "should have expected errors: $id" {
                    try {
                        val program = ProgramBuilder.buildProgramFromText(text = code)
                        ProgramTypeChecker.typeCheck(program = program, ctx = TypeCheckingContext.EMPTY)
                        fail(msg = "Found no type errors, but expect: $errorSet.")
                    } catch (compileTimeError: CompileTimeError) {
                        compileTimeError.errorMessage.split("\n").toSet() shouldBe errorSet
                    }
                }
            }
        }
    }

}
