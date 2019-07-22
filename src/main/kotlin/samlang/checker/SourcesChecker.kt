package samlang.checker

import samlang.ast.Module
import samlang.ast.ModuleReference
import samlang.ast.Sources
import samlang.util.createOrFail

fun typeCheckSources(sources: Sources): Sources {
    val errorCollector = ErrorCollector()
    val checkedSources = typeCheckSources(sources = sources, errorCollector = errorCollector)
    return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
}

private fun typeCheckSources(sources: Sources, errorCollector: ErrorCollector): Sources {
    val typeCheckingOrder = sources.getTypeCheckingOrder(errorCollector = errorCollector)
    // TODO: update context
    val context = TypeCheckingContext.EMPTY
    val newMappings = mutableMapOf<ModuleReference, Module>()
    for (moduleReference in typeCheckingOrder) {
        val moduleErrorCollector = ErrorCollector()
        val module = sources.moduleMappings[moduleReference]
            ?: error(message = "The module should be found since we just visited it in the previous pass.")
        val importCheckedModule = checkUndefinedImportsError(
            sources = sources,
            module = module,
            errorCollector = errorCollector
        )
        val checkedModule = typeCheckModule(
            module = importCheckedModule,
            typeCheckingContext = context,
            errorCollector = moduleErrorCollector
        )
        errorCollector.addErrorsWithModules(
            errorCollector = moduleErrorCollector,
            moduleReference = moduleReference
        )
        newMappings[moduleReference] = checkedModule
    }
    return Sources(moduleMappings = newMappings)
}
