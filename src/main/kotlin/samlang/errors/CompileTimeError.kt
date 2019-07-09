package samlang.errors

import samlang.ast.Range

abstract class CompileTimeError : RuntimeException("COMPILE_TIME_ERROR") {

    abstract val errorMessage: String

    abstract class WithRange(val reason: String, val range: Range) : CompileTimeError() {
        override val errorMessage: String get() = "${javaClass.simpleName}:$range: $reason"
    }

}
