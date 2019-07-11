package samlang.errors

class CompilationFailedException(val errors: List<CompileTimeError>) :
    RuntimeException(errors.joinToString(separator = "\n", postfix = "\n") { it.errorMessage }) {

    val errorMessage: String
        get() = message ?: error(message = "Impossible: error message is not properly initialized.")
}
