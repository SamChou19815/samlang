package samlang.lsp

import samlang.Configuration
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.checker.DependencyTracker
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSources
import samlang.errors.CompilationFailedException
import samlang.errors.CompileTimeError
import samlang.parser.ModuleBuilder
import samlang.service.SourceCollector

internal class LanguageServerState {
    private val dependencyTracker: DependencyTracker = DependencyTracker()
    private val rawSources: MutableMap<ModuleReference, String> = hashMapOf()
    private val rawModules: MutableMap<ModuleReference, Module> = hashMapOf()
    private val checkedModules: MutableMap<ModuleReference, Module>
    private val errors: MutableMap<ModuleReference, List<CompileTimeError>> = hashMapOf()

    init {
        val errorCollector = ErrorCollector()
        for ((moduleReference, inputStream) in SourceCollector.collectHandles(configuration = Configuration.parse())) {
            val sourceCode = inputStream.bufferedReader().use { it.readText() }
            try {
                updateRawModule(moduleReference = moduleReference, sourceCode = sourceCode)
            } catch (exception: CompilationFailedException) {
                exception.errors.forEach { errorCollector.add(compileTimeError = it) }
                continue
            }
        }
        checkedModules = typeCheckSources(
            sources = Sources(moduleMappings = rawModules),
            errorCollector = errorCollector
        ).moduleMappings.toMutableMap()
        updateErrors(updatedErrors = errorCollector.collectedErrors)
    }

    fun update(moduleReference: ModuleReference, sourceCode: String) {
        try {
            updateRawModule(moduleReference = moduleReference, sourceCode = sourceCode)
        } catch (exception: CompilationFailedException) {
            updateErrors(updatedErrors = exception.errors)
            return
        }
        /*
        val errorCollector = ErrorCollector()
        typeCheckSourcesIncrementally(
            sources = Sources(moduleMappings = rawModules),
            globalTypingContext = TODO(),
            affectedSourceList = listOf(moduleReference),
            errorCollector = errorCollector
        )
        */
    }

    private fun updateRawModule(moduleReference: ModuleReference, sourceCode: String) {
        rawSources[moduleReference] = sourceCode
        val rawModule = ModuleBuilder.buildModuleFromText(
            moduleReference = moduleReference,
            text = sourceCode
        )
        dependencyTracker.update(
            moduleReference = moduleReference,
            importedModules = rawModule.imports.map { it.importedModule }
        )
        rawModules[moduleReference] = rawModule
    }

    private fun updateErrors(updatedErrors: Collection<CompileTimeError>) {
        updatedErrors.groupBy { it.moduleReference ?: error(message = "Bad error") }.let { errors.putAll(from = it) }
    }

    fun remove(moduleReference: ModuleReference) {
        rawSources.remove(key = moduleReference)
        rawModules.remove(key = moduleReference)
        checkedModules.remove(key = moduleReference)
        val affected = HashSet(dependencyTracker.getReverseDependencies(moduleReference = moduleReference))
        dependencyTracker.update(moduleReference = moduleReference, importedModules = null)
        affected.addAll(elements = dependencyTracker.getReverseDependencies(moduleReference = moduleReference))
        // typeCheckSourcesIncrementally(sources = , affectedSourceList = , errorCollector = )
    }
}
