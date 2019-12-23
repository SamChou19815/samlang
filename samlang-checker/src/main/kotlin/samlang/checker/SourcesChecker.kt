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
    val globalTypingContext = GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources)
    val typeCheckingOrder = getTypeCheckingOrder(sources = sources, errorCollector = errorCollector)
    // TODO: use stdlib as baseContext
    val baseContext = TypeCheckingContext.EMPTY
    val newMappings = mutableMapOf<ModuleReference, Module>()
    for (moduleReference in typeCheckingOrder) {
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
            typeCheckingContext = baseContext.copy(classes = globalTypingContext.modules[moduleReference]!!.classes)
        )
        errorCollector.addErrorsWithModules(
            errorCollector = moduleErrorCollector,
            moduleReference = moduleReference
        )
        newMappings[moduleReference] = checkedModule
    }
    return Sources(moduleMappings = newMappings)
}

fun typeCheckSingleModuleSource(module: Module, errorCollector: ErrorCollector): Module {
    val moduleReference = ModuleReference(moduleName = "Test")
    return typeCheckSources(
        sources = Sources(moduleMappings = mapOf(moduleReference to module)),
        errorCollector = errorCollector
    ).moduleMappings[moduleReference] ?: error(message = "Should be there!")
}
