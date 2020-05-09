package samlang.lsp

import samlang.Configuration
import samlang.ast.common.Location
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
import samlang.parser.buildModuleFromText
import samlang.service.LocationLookup
import samlang.service.LocationLookupBuilder
import samlang.service.ReadOnlyLocationLookup
import samlang.service.SourceCollector

internal class LanguageServerState(configuration: Configuration) {
    private val dependencyTracker: DependencyTracker = DependencyTracker()
    private val rawSources: MutableMap<ModuleReference, String> = mutableMapOf()
    private val rawModules: MutableMap<ModuleReference, Module> = mutableMapOf()
    private val checkedModules: MutableMap<ModuleReference, Module>

    private val errors: MutableMap<ModuleReference, List<CompileTimeError>> = mutableMapOf()
    private var _globalTypingContext: GlobalTypingContext
    val globalTypingContext: GlobalTypingContext get() = _globalTypingContext
    private var _expressionLocationLookup: LocationLookup<Expression> = LocationLookup()
    private var _classLocationLookup: LocationLookup<String> = LocationLookup()
    val expressionLocationLookup: ReadOnlyLocationLookup<Expression> = _expressionLocationLookup
    val classLocationLookup: ReadOnlyLocationLookup<String> = _classLocationLookup

    init {
        val errorCollector = ErrorCollector()
        for ((moduleReference, inputStream) in SourceCollector.collectHandles(configuration = configuration)) {
            val sourceCode = inputStream.bufferedReader().use { it.readText() }
            val (rawModule, parseErrors) = updateRawModule(moduleReference = moduleReference, sourceCode = sourceCode)
            parseErrors.forEach { errorCollector.add(compileTimeError = it) }
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
        val locationLookupBuilder = LocationLookupBuilder(locationLookup = _expressionLocationLookup)
        checkedModules.forEach { (moduleReference, checkedModule) ->
            locationLookupBuilder.rebuild(moduleReference = moduleReference, module = checkedModule)
            checkedModule.classDefinitions.forEach { classDefinition ->
                val location = Location(moduleReference = moduleReference, range = classDefinition.range)
                _classLocationLookup[location] = classDefinition.name
            }
        }
        _globalTypingContext = context
        updateErrors(updatedErrors = errorCollector.collectedErrors)
    }

    val allModulesWithError: List<ModuleReference> get() = errors.keys.toList()

    val allErrors: List<CompileTimeError> get() = errors.values.flatten()

    fun getErrors(moduleReference: ModuleReference): List<CompileTimeError> = errors[moduleReference] ?: emptyList()

    fun update(moduleReference: ModuleReference, sourceCode: String): List<ModuleReference> {
        val (rawModule, parseErrors) = updateRawModule(moduleReference = moduleReference, sourceCode = sourceCode)
        val affected = reportChanges(moduleReference = moduleReference, module = rawModule)
        incrementalTypeCheck(affectedSourceList = affected, parseErrors = parseErrors)
        return affected
    }

    fun remove(moduleReference: ModuleReference): List<ModuleReference> {
        rawSources.remove(key = moduleReference)
        rawModules.remove(key = moduleReference)
        checkedModules.remove(key = moduleReference)
        errors[moduleReference] = emptyList()
        _expressionLocationLookup.purge(moduleReference = moduleReference)
        _classLocationLookup.purge(moduleReference = moduleReference)
        val affected = reportChanges(moduleReference = moduleReference, module = null)
        incrementalTypeCheck(affectedSourceList = affected, parseErrors = emptyList())
        return affected
    }

    private fun updateRawModule(
        moduleReference: ModuleReference,
        sourceCode: String
    ): Pair<Module, List<CompileTimeError>> {
        rawSources[moduleReference] = sourceCode
        val result = buildModuleFromText(
            moduleReference = moduleReference,
            text = sourceCode
        )
        rawModules[moduleReference] = result.first
        return result
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

    private fun incrementalTypeCheck(affectedSourceList: List<ModuleReference>, parseErrors: List<CompileTimeError>) {
        val errorCollector = ErrorCollector()
        val (updatedModules, updatedContext) = typeCheckSourcesIncrementally(
            sources = Sources(moduleMappings = rawModules),
            globalTypingContext = _globalTypingContext,
            affectedSourceList = affectedSourceList,
            errorCollector = errorCollector
        )
        checkedModules.putAll(from = updatedModules)
        val locationLookupBuilder = LocationLookupBuilder(locationLookup = _expressionLocationLookup)
        updatedModules.forEach { (moduleReference, checkedModule) ->
            locationLookupBuilder.rebuild(moduleReference = moduleReference, module = checkedModule)
            checkedModule.classDefinitions.forEach { classDefinition ->
                val location = Location(moduleReference = moduleReference, range = classDefinition.range)
                _classLocationLookup[location] = classDefinition.name
            }
        }
        _globalTypingContext = updatedContext
        affectedSourceList.forEach { affectedSource -> errors.remove(key = affectedSource) }
        updateErrors(updatedErrors = parseErrors + errorCollector.collectedErrors)
    }
}
