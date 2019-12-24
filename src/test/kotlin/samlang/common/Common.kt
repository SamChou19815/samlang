package samlang.common

import io.kotlintest.fail
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSingleModuleSource
import samlang.parser.ModuleBuilder

internal fun getTypeCheckedModule(code: String): Module {
    val errorCollector = ErrorCollector()
    val module = typeCheckSingleModuleSource(
        module = ModuleBuilder.buildModuleFromText(moduleReference = ModuleReference(moduleName = "test"), text = code),
        errorCollector = errorCollector
    )
    if (errorCollector.collectedErrors.isNotEmpty()) {
        fail(msg = "Detected errors: ${errorCollector.collectedErrors}")
    }
    return module
}
