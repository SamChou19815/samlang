package samlang.checker

import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.util.createOrFail

fun typeCheckSources(sources: Sources<Module>): Sources<Module> {
    val errorCollector = ErrorCollector()
    val checkedSources = typeCheckSources(sources = sources, errorCollector = errorCollector)
    return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
}

fun typeCheckSources(sources: Sources<Module>, errorCollector: ErrorCollector): Sources<Module> {
    // TODO: Include stdlib into globalTypingContext
    val globalTypingContext = GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources)
    // TODO: Include checked stdlib into newMappings
    val newMappings = mutableMapOf<ModuleReference, Module>()
    for (moduleReference in sources.moduleMappings.keys) {
        newMappings[moduleReference] = typeCheckModule(
            sources = sources,
            globalTypingContext = globalTypingContext,
            moduleReference = moduleReference,
            errorCollector = errorCollector
        )
    }
    return Sources(moduleMappings = newMappings)
}

fun typeCheckSourcesIncrementally(
    sources: Sources<Module>,
    updatedSourceList: List<ModuleReference>,
    errorCollector: ErrorCollector
): Map<ModuleReference, Module> {
    // TODO: Create incremental version of `GlobalTypingContextBuilder.buildGlobalTypingContext()`.
    val globalTypingContext = GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources)
    val newMappings = mutableMapOf<ModuleReference, Module>()
    for (moduleReference in updatedSourceList) {
        newMappings[moduleReference] = typeCheckModule(
            sources = sources,
            globalTypingContext = globalTypingContext,
            moduleReference = moduleReference,
            errorCollector = errorCollector
        )
    }
    return newMappings
}

private fun typeCheckModule(
    sources: Sources<Module>,
    globalTypingContext: GlobalTypingContext,
    moduleReference: ModuleReference,
    errorCollector: ErrorCollector
): Module {
    val moduleErrorCollector = ErrorCollector()
    val module = sources.moduleMappings[moduleReference]
        ?: error(message = "The module should be found since we just visited it in the previous pass.")
    checkUndefinedImportsError(
        sources = sources,
        module = module,
        errorCollector = errorCollector
    )
    val checkedModule = ModuleTypeChecker(errorCollector = moduleErrorCollector).typeCheck(
        module = module,
        classes = globalTypingContext.modules[moduleReference]!!.classes
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
