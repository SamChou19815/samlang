package samlang.service

import java.io.InputStream
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.util.createOrFail

object SourceChecker {
    fun typeCheck(sourceHandles: List<Pair<ModuleReference, InputStream>>): Sources<Module> {
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
            samlang.checker.typeCheckSources(
                sources = Sources(moduleMappings = moduleMappings),
                errorCollector = errorCollector
            )
        return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
    }
}
