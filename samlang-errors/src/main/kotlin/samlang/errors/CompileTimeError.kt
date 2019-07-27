package samlang.errors

import samlang.ast.common.Range

open class CompileTimeError(
    val file: String? = null,
    val range: Range,
    val type: String? = null,
    val reason: String
) : RuntimeException(reason) {

    private val defaultErrorType: String
        get() = javaClass.simpleName.let { name ->
            if (name.endsWith(suffix = "Error")) name.substring(
                startIndex = 0,
                endIndex = name.length - 5
            ) else name
        }

    open val errorMessage: String
        get() {
            val errorFile = file ?: error(message = "Error file must be provided when printing error message.")
            val errorType = type ?: defaultErrorType
            return "$errorFile:$range: [$errorType]: $reason"
        }

    fun withErrorModule(file: String): CompileTimeError =
        CompileTimeError(file = file, range = range, type = type ?: defaultErrorType, reason = reason)

    abstract class WithRange(reason: String, range: Range) : CompileTimeError(range = range, reason = reason)
}
