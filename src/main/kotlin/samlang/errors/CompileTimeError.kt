package samlang.errors

import samlang.parser.Position

open class CompileTimeError(errorMessage: String) : RuntimeException(errorMessage) {

    val errorMessage: String = "${javaClass.simpleName}:\n$errorMessage"

    open class WithPosition(reason: String, val position: Position) : CompileTimeError(
        errorMessage = "At position $position:\n$reason"
    )

}
