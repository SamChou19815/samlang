package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.programs.badTestPrograms
import samlang.programs.wellTypedTestPrograms
import samlang.util.createOrFail

class ModuleTypeCheckerTest : StringSpec() {
    init {
        listOf(wellTypedTestPrograms, badTestPrograms).flatten().forEach { (id, errorSet, code) ->
            val testName = if (errorSet.isEmpty()) {
                "Good: $id"
            } else {
                "Bad: $id"
            }
            testName { getTypeErrors(id = id, code = code) shouldBe errorSet }
        }
    }

    private fun getTypeErrors(id: String, code: String): Set<String> {
        return try {
            val moduleReference = ModuleReference(moduleName = id)
            val errorCollector = ErrorCollector()
            val (module, parseErrors) = ModuleBuilder.buildModuleFromText(
                moduleReference = moduleReference,
                text = code
            )
            parseErrors.forEach { errorCollector.add(compileTimeError = it) }
            val sources = Sources(mapOf(moduleReference to module))
            val checkedSources = typeCheckSources(sources = sources, errorCollector = errorCollector)
            createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
            emptySet()
        } catch (compilationFailedException: CompilationFailedException) {
            compilationFailedException.errors.map { it.errorMessage }.toSortedSet()
        }
    }
}
