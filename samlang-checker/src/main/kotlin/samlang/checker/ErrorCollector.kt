package samlang.checker

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.errors.CollisionError
import samlang.errors.CompileTimeError

class ErrorCollector {

    private val _collectedErrors: MutableList<CompileTimeError> = arrayListOf()
    val collectedErrors: List<CompileTimeError> get() = _collectedErrors

    internal fun addErrorsWithModules(errorCollector: ErrorCollector, moduleReference: ModuleReference) {
        errorCollector._collectedErrors.forEach { error ->
            _collectedErrors.add(element = error.withErrorModule(moduleReference = moduleReference))
        }
    }

    fun add(compileTimeError: CompileTimeError) {
        _collectedErrors.add(element = compileTimeError)
    }

    fun reportCollisionError(name: String, range: Range): Unit =
        add(compileTimeError = CollisionError(collidedName = name, range = range))
}
