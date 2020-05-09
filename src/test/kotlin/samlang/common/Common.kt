package samlang.common

import io.kotlintest.fail
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSingleModuleSource
import samlang.parser.buildModuleFromText

internal fun getTypeCheckedModule(code: String): Module {
    val errorCollector = ErrorCollector()
    val module = typeCheckSingleModuleSource(
        module = buildModuleFromText(
            moduleReference = ModuleReference(moduleName = "test"),
            text = code
        ).first,
        errorCollector = errorCollector
    )
    if (errorCollector.collectedErrors.isNotEmpty()) {
        fail(msg = "Detected errors: ${errorCollector.collectedErrors}")
    }
    return module
}
