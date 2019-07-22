package samlang.common

import io.kotlintest.fail
import samlang.ast.Module
import samlang.checker.ErrorCollector
import samlang.checker.TypeCheckingContext
import samlang.checker.typeCheckModule
import samlang.parser.ModuleBuilder

internal fun getTypeCheckedModule(
    code: String,
    typeCheckingContext: TypeCheckingContext = TypeCheckingContext.EMPTY
): Module {
    val errorCollector = ErrorCollector()
    val module = typeCheckModule(
        module = ModuleBuilder.buildModuleFromText(file = "test.sam", text = code),
        typeCheckingContext = typeCheckingContext,
        errorCollector = errorCollector
    )
    if (errorCollector.collectedErrors.isNotEmpty()) {
        fail(msg = "Detected errors: ${errorCollector.collectedErrors}")
    }
    return module
}
