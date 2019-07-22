package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.ModuleReference
import samlang.ast.Sources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.programs.testPrograms
import samlang.stdlib.StandardLibrary

class ModuleTypeCheckerTest : StringSpec() {

    private fun getTypeErrors(id: String, code: String): Set<String> {
        return try {
            val module = ModuleBuilder.buildModuleFromText(file = "$id.sam", text = code)
            val sources = Sources(mapOf(ModuleReference(moduleName = id) to module))
            typeCheckSources(sources = sources)
            emptySet()
        } catch (compilationFailedException: CompilationFailedException) {
            compilationFailedException.errors.map { it.errorMessage }.toSortedSet()
        }
    }

    init {
        "stdlib" { getTypeErrors(id = "standard-library", code = StandardLibrary.sourceCode) shouldBe emptySet() }
        testPrograms.forEach { (id, errorSet, code) -> id { getTypeErrors(id = id, code = code) shouldBe errorSet } }
    }
}
