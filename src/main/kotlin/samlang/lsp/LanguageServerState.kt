package samlang.lsp

import samlang.Configuration
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Expression
import samlang.ast.lang.Module
import samlang.checker.DependencyTracker
import samlang.checker.ErrorCollector
import samlang.checker.GlobalTypingContext
import samlang.checker.typeCheckSources
import samlang.checker.typeCheckSourcesIncrementally
import samlang.errors.CompileTimeError
import samlang.parser.ModuleBuilder
import samlang.service.LocationLookup
import samlang.service.LocationLookupBuilder
import samlang.service.ReadOnlyLocationLookup
import samlang.service.SourceCollector

internal class LanguageServerState(configuration: Configuration) {
    private val dependencyTracker: DependencyTracker = DependencyTracker()
    private val rawSources: MutableMap<ModuleReference, String> = hashMapOf()
    private val rawModules: MutableMap<ModuleReference, Module> = hashMapOf()
    private val checkedModules: MutableMap<ModuleReference, Module>

    private val errors: MutableMap<ModuleReference, List<CompileTimeError>> = hashMapOf()
    private var _globalTypingContext: GlobalTypingContext
    val globalTypingContext: GlobalTypingContext get() = _globalTypingContext
    private var _locationLookup: LocationLookup<Expression> = LocationLookup()
    val locationLookup: ReadOnlyLocationLookup<Expression> = _locationLookup

    init {
        val errorCollector = ErrorCollector()
        for ((moduleReference, inputStream) in SourceCollector.collectHandles(configuration = configuration)) {
            val sourceCode = inputStream.bufferedReader().use { it.readText() }
            errors[moduleReference] = emptyList()
            val rawModule = updateRawModule(moduleReference = moduleReference, sourceCode = sourceCode)
            dependencyTracker.update(
                moduleReference = moduleReference,
                importedModules = rawModule.imports.map { it.importedModule }
            )
        }
        val (checkedSources, context) = typeCheckSources(
            sources = Sources(moduleMappings = rawModules),
            errorCollector = errorCollector
        )
        checkedModules = checkedSources.moduleMappings.toMutableMap()
        val locationLookupBuilder = LocationLookupBuilder(locationLookup = _locationLookup)
        checkedModules.forEach { (moduleReference, checkedModule) ->
            locationLookupBuilder.rebuild(moduleReference = moduleReference, module = checkedModule)
        }
        _globalTypingContext = context
        updateErrors(updatedErrors = errorCollector.collectedErrors)
    }

    val allModulesWithError: List<ModuleReference> get() = errors.keys.toList()

    val allErrors: List<CompileTimeError> get() = errors.values.flatten()

    fun getErrors(moduleReference: ModuleReference): List<CompileTimeError> = errors[moduleReference] ?: emptyList()

    fun update(moduleReference: ModuleReference, sourceCode: String): List<ModuleReference> {
        val rawModule = updateRawModule(moduleReference = moduleReference, sourceCode = sourceCode)
        val affected = reportChanges(moduleReference = moduleReference, module = rawModule)
        incrementalTypeCheck(affectedSourceList = affected)
        return affected
    }

    fun remove(moduleReference: ModuleReference): List<ModuleReference> {
        rawSources.remove(key = moduleReference)
        rawModules.remove(key = moduleReference)
        checkedModules.remove(key = moduleReference)
        errors[moduleReference] = emptyList()
        _locationLookup.purge(moduleReference = moduleReference)
        val affected = reportChanges(moduleReference = moduleReference, module = null)
        incrementalTypeCheck(affectedSourceList = affected)
        return affected
    }

    private fun updateRawModule(moduleReference: ModuleReference, sourceCode: String): Module {
        rawSources[moduleReference] = sourceCode
        val (rawModule, parseErrors) = ModuleBuilder.buildModuleFromText(
            moduleReference = moduleReference,
            text = sourceCode
        )
        rawModules[moduleReference] = rawModule
        updateErrors(updatedErrors = parseErrors)
        return rawModule
    }

    private fun updateErrors(updatedErrors: Collection<CompileTimeError>) {
        updatedErrors.groupBy { it.moduleReference ?: error(message = "Bad error") }.let { errors.putAll(from = it) }
    }

    private fun reportChanges(moduleReference: ModuleReference, module: Module?): List<ModuleReference> {
        val affected = hashSetOf(moduleReference)
        affected.addAll(elements = dependencyTracker.getReverseDependencies(moduleReference = moduleReference))
        if (module == null) {
            dependencyTracker.update(moduleReference = moduleReference, importedModules = null)
        } else {
            dependencyTracker.update(
                moduleReference = moduleReference,
                importedModules = module.imports.map { it.importedModule }
            )
        }
        affected.addAll(elements = dependencyTracker.getReverseDependencies(moduleReference = moduleReference))
        return affected.toList()
    }

    private fun incrementalTypeCheck(affectedSourceList: List<ModuleReference>) {
        val errorCollector = ErrorCollector()
        val (updatedModules, updatedContext) = typeCheckSourcesIncrementally(
            sources = Sources(moduleMappings = rawModules),
            globalTypingContext = _globalTypingContext,
            affectedSourceList = affectedSourceList,
            errorCollector = errorCollector
        )
        checkedModules.putAll(from = updatedModules)
        val locationLookupBuilder = LocationLookupBuilder(locationLookup = _locationLookup)
        updatedModules.forEach { (moduleReference, checkedModule) ->
            locationLookupBuilder.rebuild(moduleReference = moduleReference, module = checkedModule)
        }
        _globalTypingContext = updatedContext
        affectedSourceList.forEach { affectedSource -> errors.remove(key = affectedSource) }
        updateErrors(updatedErrors = errorCollector.collectedErrors)
    }
}
