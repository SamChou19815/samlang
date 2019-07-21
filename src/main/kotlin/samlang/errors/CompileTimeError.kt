package samlang.errors

import samlang.ast.Range

open class CompileTimeError(private val file: String? = null, val range: Range, val reason: String) :
    RuntimeException(reason) {

    open val errorClass: String
        get() = javaClass.simpleName.let { name ->
            if (name.endsWith(suffix = "Error")) name.substring(
                startIndex = 0,
                endIndex = name.length - 5
            ) else name
        }

    open val errorMessage: String
        get() =
            if (file == null) "$range: [$errorClass]: $reason" else "$file:$range: [$errorClass]: $reason"

    abstract class WithRange(reason: String, range: Range) : CompileTimeError(range = range, reason = reason)
}
