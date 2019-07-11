package samlang.errors

import samlang.ast.Range

abstract class CompileTimeError(protected val errorInformation: String) : RuntimeException(errorInformation) {

    abstract val errorMessage: String

    abstract class WithRange(val reason: String, val range: Range) :
        CompileTimeError(errorInformation = "$range: $reason") {
        override val errorMessage: String = "${javaClass.simpleName}:$errorInformation"
    }
}
