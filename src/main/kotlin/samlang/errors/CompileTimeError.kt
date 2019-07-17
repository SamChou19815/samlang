package samlang.errors

import samlang.ast.Range

open class CompileTimeError(protected val errorInformation: String) : RuntimeException(errorInformation) {

    private val errorClass: String
        get() = javaClass.simpleName.let { name ->
            if (name.endsWith(suffix = "Error")) name.substring(
                startIndex = 0,
                endIndex = name.length - 5
            ) else name
        }

    open val errorMessage: String = "$errorClass:$errorInformation"

    abstract class WithRange(val reason: String, val range: Range) :
        CompileTimeError(errorInformation = "$range: $reason")
}
