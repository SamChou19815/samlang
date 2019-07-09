package samlang.errors

import samlang.ast.Range

open class CompileTimeError(errorMessage: String) : RuntimeException(errorMessage) {

    val errorMessage: String = "${javaClass.simpleName}: $errorMessage"

    abstract class WithRange(reason: String, val range: Range) : CompileTimeError(errorMessage = "$range: $reason")

}
