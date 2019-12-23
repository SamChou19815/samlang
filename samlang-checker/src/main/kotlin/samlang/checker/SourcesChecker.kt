package samlang.checker

import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module

fun typeCheckSources(sources: Sources<Module>, errorCollector: ErrorCollector): Sources<Module> {
    // TODO: Include stdlib into globalTypingContext
    val globalTypingContext = GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources)
    // TODO: Include checked stdlib into newMappings
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
    return Sources(moduleMappings = newMappings)
}

fun typeCheckSourcesIncrementally(
    sources: Sources<Module>,
    globalTypingContext: GlobalTypingContext,
    affectedSourceList: List<ModuleReference>,
    errorCollector: ErrorCollector
): Map<ModuleReference, Module> {
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
    return newMappings
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
        errorCollector = errorCollector
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
    return typeCheckSources(
        sources = Sources(moduleMappings = mapOf(moduleReference to module)),
        errorCollector = errorCollector
    ).moduleMappings[moduleReference] ?: error(message = "Should be there!")
}
