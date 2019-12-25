package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.programs.testPrograms
import samlang.util.createOrFail

class ModuleTypeCheckerTest : StringSpec() {

    private fun getTypeErrors(id: String, code: String): Set<String> {
        return try {
            val moduleReference = ModuleReference(moduleName = id)
            val module = ModuleBuilder.buildModuleFromText(moduleReference = moduleReference, text = code)
            val sources = Sources(mapOf(moduleReference to module))
            val errorCollector = ErrorCollector()
            val checkedSources = typeCheckSources(sources = sources, errorCollector = errorCollector)
            createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
            emptySet()
        } catch (compilationFailedException: CompilationFailedException) {
            compilationFailedException.errors.map { it.errorMessage }.toSortedSet()
        }
    }

    init {
        testPrograms.forEach { (id, errorSet, code) -> id { getTypeErrors(id = id, code = code) shouldBe errorSet } }
    }
}
