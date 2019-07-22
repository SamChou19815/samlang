package samlang.common

import io.kotlintest.fail
import samlang.ast.Module
import samlang.checker.ErrorCollector
import samlang.checker.ModuleTypeChecker
import samlang.checker.TypeCheckingContext
import samlang.parser.ModuleBuilder

internal fun getTypeCheckedModule(
    code: String,
    typeCheckingContext: TypeCheckingContext = TypeCheckingContext.EMPTY
): Module {
    val errorCollector = ErrorCollector()
    val (module, _) = ModuleTypeChecker(errorCollector = errorCollector).typeCheck(
        module = ModuleBuilder.buildModuleFromText(file = "test.sam", text = code),
        typeCheckingContext = typeCheckingContext
    )
    if (errorCollector.collectedErrors.isNotEmpty()) {
        fail(msg = "Detected errors: ${errorCollector.collectedErrors}")
    }
    return module
}
