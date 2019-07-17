package samlang.checker

import io.kotlintest.fail
import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.errors.CompilationFailedException
import samlang.parser.SourceBuilder
import samlang.programs.testPrograms
import samlang.stdlib.StandardLibrary

class TypeCheckerTest : StringSpec() {

    init {
        "stdlib type checks" {
            SourceBuilder.buildSourceFromText(text = StandardLibrary.sourceCode).typeCheck()
        }
        for ((id, errorSet, code) in testPrograms) {
            if (errorSet.isEmpty()) {
                "should have no errors: $id" { SourceBuilder.buildSourceFromText(text = code).typeCheck() }
            } else {
                "should have expected errors: $id" {
                    try {
                        SourceBuilder.buildSourceFromText(text = code).typeCheck()
                        fail(msg = "Found no type errors, but expect: $errorSet.")
                    } catch (exception: CompilationFailedException) {
                        exception.errors.asSequence().map { it.errorMessage }.toSortedSet() shouldBe errorSet
                    }
                }
            }
        }
    }
}
