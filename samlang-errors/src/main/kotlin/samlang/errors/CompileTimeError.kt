package samlang.errors

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range

open class CompileTimeError(
    private val errorType: String,
    val moduleReference: ModuleReference? = null,
    val range: Range,
    val reason: String
) {
    open val errorMessage: String
        get() {
            val errorFile = moduleReference?.toFilename()
                ?: error(message = "Error file must be provided when printing error message.")
            return "$errorFile:$range: [$errorType]: $reason"
        }

    fun withErrorModule(moduleReference: ModuleReference): CompileTimeError = CompileTimeError(
        errorType = errorType,
        moduleReference = moduleReference,
        range = range,
        reason = reason
    )

    abstract class WithRange(errorType: String, reason: String, range: Range) : CompileTimeError(
        errorType = errorType,
        range = range,
        reason = reason
    )
}
