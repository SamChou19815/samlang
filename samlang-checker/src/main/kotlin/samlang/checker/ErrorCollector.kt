package samlang.checker

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.errors.CollisionError
import samlang.errors.CompileTimeError

class ErrorCollector {

    val collectedErrors: List<CompileTimeError> get() = _collectedErrors

    internal fun addErrorsWithModules(errorCollector: ErrorCollector, moduleReference: ModuleReference) {
        val moduleFile = moduleReference.toFilename()
        errorCollector._collectedErrors.forEach { error ->
            _collectedErrors.add(element = error.withErrorModule(file = moduleFile))
        }
    }

    private val _collectedErrors: MutableList<CompileTimeError> = arrayListOf()

    fun add(compileTimeError: CompileTimeError) {
        _collectedErrors.add(element = compileTimeError)
    }

    fun reportCollisionError(name: String, range: Range): Unit =
        add(compileTimeError = CollisionError(collidedName = name, range = range))

    internal inline fun <T> returnNullOnCollectedError(crossinline checker: () -> T): T? =
        try {
            checker()
        } catch (compileTimeError: CompileTimeError) {
            _collectedErrors.add(element = compileTimeError)
            null
        }
}
