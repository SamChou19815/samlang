package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.errors.CompilationFailedException
import samlang.parser.buildModuleFromText
import samlang.programs.badTestPrograms
import samlang.programs.wellTypedTestPrograms

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
            val (module, parseErrors) = buildModuleFromText(
                moduleReference = moduleReference,
                text = code
            )
            parseErrors.forEach { errorCollector.add(compileTimeError = it) }
            val sources = Sources(mapOf(moduleReference to module))
            typeCheckSources(sources = sources, errorCollector = errorCollector)
            if (errorCollector.collectedErrors.isNotEmpty()) {
                throw CompilationFailedException(errors = errorCollector.collectedErrors)
            }
            emptySet()
        } catch (compilationFailedException: CompilationFailedException) {
            compilationFailedException.errors.map { it.errorMessage }.toSortedSet()
        }
    }
}
