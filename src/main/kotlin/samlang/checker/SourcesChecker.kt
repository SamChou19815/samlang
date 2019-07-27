package samlang.checker

import samlang.ast.lang.Module
import samlang.ast.lang.ModuleReference
import samlang.ast.lang.Sources
import samlang.util.createOrFail

internal fun typeCheckSources(sources: Sources): Sources {
    val errorCollector = ErrorCollector()
    val checkedSources = typeCheckSources(sources = sources, errorCollector = errorCollector)
    return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
}

internal fun typeCheckSources(sources: Sources, errorCollector: ErrorCollector): Sources {
    val typeCheckingOrder = sources.getTypeCheckingOrder(errorCollector = errorCollector)
    // TODO: use stdlib as baseContext
    val baseContext = TypeCheckingContext.EMPTY
    val newMappings = mutableMapOf<ModuleReference, Module>()
    val moduleContexts = mutableMapOf<ModuleReference, TypeCheckingContext>()
    for (moduleReference in typeCheckingOrder) {
        val moduleErrorCollector = ErrorCollector()
        val module = sources.moduleMappings[moduleReference]
            ?: error(message = "The module should be found since we just visited it in the previous pass.")
        val importCheckedModule = checkUndefinedImportsError(
            sources = sources,
            module = module,
            errorCollector = errorCollector
        )
        val extendedContext = importCheckedModule.imports.fold(initial = baseContext) { context, import ->
            val moduleContext =
                moduleContexts[import.importedModule] ?: error(message = "Type checking order might be wrong")
            import.importedMembers.fold(initial = context) { contextAccumulator, (member, _) ->
                val classType =
                    moduleContext.classes[member] ?: error(message = "Undefined member check might be wrong!")
                contextAccumulator.copy(classes = contextAccumulator.classes.put(key = member, value = classType))
            }
        }
        val (checkedModule, contextWithModule) = ModuleTypeChecker(errorCollector = moduleErrorCollector).typeCheck(
            module = importCheckedModule,
            typeCheckingContext = extendedContext
        )
        errorCollector.addErrorsWithModules(
            errorCollector = moduleErrorCollector,
            moduleReference = moduleReference
        )
        newMappings[moduleReference] = checkedModule
        moduleContexts[moduleReference] = contextWithModule
    }
    return Sources(moduleMappings = newMappings)
}
