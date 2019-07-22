package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.ModuleReference
import samlang.ast.Range
import samlang.ast.Sources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.programs.testPrograms
import samlang.stdlib.StandardLibrary

class TypeCheckerTest : StringSpec() {

    private fun getTypeErrors(
        id: String,
        code: String
    ): Set<String> {
        return try {
            val module = ModuleBuilder.buildModuleFromText(file = "$id.sam", text = code)
            val sources = Sources(mapOf(ModuleReference(range = Range.DUMMY, parts = listOf(id)) to module))
            typeCheckSources(sources = sources)
            emptySet()
        } catch (compilationFailedException: CompilationFailedException) {
            compilationFailedException.errors.map { it.errorMessage }.toSortedSet()
        }
    }

    init {
        "stdlib" {
            getTypeErrors(id = "standard-library", code = StandardLibrary.sourceCode) shouldBe emptySet()
        }
        for ((id, errorSet, code) in testPrograms) {
            id { getTypeErrors(id = id, code = code) shouldBe errorSet }
        }
    }
}
