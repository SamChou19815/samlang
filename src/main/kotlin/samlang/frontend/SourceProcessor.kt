package samlang.frontend

import samlang.ast.Module
import samlang.ast.ModuleReference
import samlang.ast.Sources
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.util.createOrFail
import java.io.InputStream

fun processSources(sourceHandles: List<Pair<ModuleReference, InputStream>>): Sources {
    val errorCollector = ErrorCollector()
    val moduleMappings = hashMapOf<ModuleReference, Module>()
    for ((moduleReference, inputStream) in sourceHandles) {
        val module = inputStream.use { stream ->
            try {
                ModuleBuilder.buildModule(file = moduleReference.toFilename(), inputStream = stream)
            } catch (compilationFailedException: CompilationFailedException) {
                compilationFailedException.errors.forEach { errorCollector.add(compileTimeError = it) }
                null
            }
        } ?: continue
        moduleMappings[moduleReference] = module
    }
    val checkedSources =
        typeCheckSources(sources = Sources(moduleMappings = moduleMappings), errorCollector = errorCollector)
    return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
}
