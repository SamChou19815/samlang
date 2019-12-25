package samlang.checker

import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module

fun typeCheckSources(
    sources: Sources<Module>,
    errorCollector: ErrorCollector
): Pair<Sources<Module>, GlobalTypingContext> {
    val globalTypingContext = GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources)
    val newMappings = mutableMapOf<ModuleReference, Module>()
    for ((moduleReference, module) in sources.moduleMappings) {
        newMappings[moduleReference] = typeCheckModule(
            sources = sources,
            globalTypingContext = globalTypingContext,
            moduleReference = moduleReference,
            module = module,
            errorCollector = errorCollector
        )
    }
    return Sources(moduleMappings = newMappings) to globalTypingContext
}

fun typeCheckSourcesIncrementally(
    sources: Sources<Module>,
    globalTypingContext: GlobalTypingContext,
    affectedSourceList: List<ModuleReference>,
    errorCollector: ErrorCollector
): Pair<Map<ModuleReference, Module>, GlobalTypingContext> {
    val updatedGlobalTypingContext = GlobalTypingContextBuilder.updateGlobalTypingContext(
        globalTypingContext = globalTypingContext,
        sources = sources,
        potentiallyAffectedModuleReferences = affectedSourceList
    )
    val newMappings = mutableMapOf<ModuleReference, Module>()
    for (moduleReference in affectedSourceList) {
        val module = sources.moduleMappings[moduleReference] ?: continue
        newMappings[moduleReference] = typeCheckModule(
            sources = sources,
            globalTypingContext = updatedGlobalTypingContext,
            moduleReference = moduleReference,
            module = module,
            errorCollector = errorCollector
        )
    }
    return newMappings to updatedGlobalTypingContext
}

private fun typeCheckModule(
    sources: Sources<Module>,
    globalTypingContext: GlobalTypingContext,
    moduleReference: ModuleReference,
    module: Module,
    errorCollector: ErrorCollector
): Module {
    val moduleErrorCollector = ErrorCollector()
    checkUndefinedImportsError(
        sources = sources,
        module = module,
        errorCollector = moduleErrorCollector
    )
    val moduleContext = globalTypingContext.modules[moduleReference]
        ?: error(message = "Missing module $moduleReference!")
    val checkedModule = ModuleTypeChecker(errorCollector = moduleErrorCollector).typeCheck(
        module = module,
        classes = moduleContext.definedClasses.putAll(m = moduleContext.importedClasses)
    )
    errorCollector.addErrorsWithModules(
        errorCollector = moduleErrorCollector,
        moduleReference = moduleReference
    )
    return checkedModule
}

fun typeCheckSingleModuleSource(module: Module, errorCollector: ErrorCollector): Module {
    val moduleReference = ModuleReference(moduleName = "Test")
    val (checkedSources, _) = typeCheckSources(
        sources = Sources(moduleMappings = mapOf(moduleReference to module)),
        errorCollector = errorCollector
    )
    return checkedSources.moduleMappings[moduleReference] ?: error(message = "Should be there!")
}
