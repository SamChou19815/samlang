package samlang.errors

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range

open class CompileTimeError(
    val moduleReference: ModuleReference? = null,
    val range: Range,
    val type: String? = null,
    val reason: String
) {

    private val defaultErrorType: String
        get() = javaClass.simpleName.let { name ->
            if (name.endsWith(suffix = "Error")) name.substring(
                startIndex = 0,
                endIndex = name.length - 5
            ) else name
        }

    open val errorMessage: String
        get() {
            val errorFile = moduleReference?.toFilename()
                ?: error(message = "Error file must be provided when printing error message.")
            val errorType = type ?: defaultErrorType
            return "$errorFile:$range: [$errorType]: $reason"
        }

    fun withErrorModule(moduleReference: ModuleReference): CompileTimeError = CompileTimeError(
        moduleReference = moduleReference,
        range = range,
        type = type ?: defaultErrorType,
        reason = reason
    )

    abstract class WithRange(reason: String, range: Range) : CompileTimeError(range = range, reason = reason)
}
