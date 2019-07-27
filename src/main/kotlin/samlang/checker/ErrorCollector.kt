package samlang.checker

import samlang.ast.lang.ModuleReference
import samlang.errors.CompileTimeError

internal inline fun <T> T.collectPotentialError(errorCollector: ErrorCollector, crossinline checker: T.() -> T): T =
    errorCollector.collectPotentialError(unchecked = this, checker = checker)

internal class ErrorCollector {

    val collectedErrors: List<CompileTimeError> get() = _collectedErrors

    fun addErrorsWithModules(errorCollector: ErrorCollector, moduleReference: ModuleReference) {
        val moduleFile = moduleReference.toFilename()
        errorCollector._collectedErrors.forEach { error ->
            _collectedErrors.add(element = error.withErrorModule(file = moduleFile))
        }
    }

    private val _collectedErrors: MutableList<CompileTimeError> = arrayListOf()

    fun add(compileTimeError: CompileTimeError) {
        _collectedErrors.add(element = compileTimeError)
    }

    inline fun <T> collectPotentialError(unchecked: T, crossinline checker: (T) -> T): T =
        try {
            checker(unchecked)
        } catch (compileTimeError: CompileTimeError) {
            _collectedErrors.add(element = compileTimeError)
            unchecked
        }

    inline fun <T> check(crossinline checker: () -> T) {
        try {
            checker()
        } catch (compileTimeError: CompileTimeError) {
            _collectedErrors.add(element = compileTimeError)
        }
    }

    inline fun <T> passCheck(crossinline checker: () -> T): Boolean =
        try {
            checker()
            true
        } catch (compileTimeError: CompileTimeError) {
            _collectedErrors.add(element = compileTimeError)
            false
        }

    inline fun <T> returnNullOnCollectedError(crossinline checker: () -> T): T? =
        try {
            checker()
        } catch (compileTimeError: CompileTimeError) {
            _collectedErrors.add(element = compileTimeError)
            null
        }
}
