package samlang.checker

import samlang.ast.Module
import samlang.ast.Program
import samlang.util.createProgramOrFail

fun Program.typeCheck(typeCheckingContext: TypeCheckingContext = TypeCheckingContext.EMPTY): Program {
    val checkedModules = arrayListOf<Module>()
    var currentContext = typeCheckingContext
    val errorCollector = ErrorCollector()
    for (module in modules) {
        val (checkedModule, newCtx) = module.typeCheck(
            errorCollector = errorCollector,
            typeCheckingContext = currentContext
        )
        checkedModule?.let { checkedModules.add(element = it) }
        currentContext = newCtx
    }
    return createProgramOrFail(program = this.copy(modules = checkedModules), errors = errorCollector.collectedErrors)
}
