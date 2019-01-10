package samlang.errors

class SyntaxErrors(errors: List<Triple<Int, Int, String>>) : CompileTimeError(
    errorMessage = errors.joinToString(separator = "\n", prefix = "\n") { (lineNo, colNo, reason) ->
        "Starting Position: $lineNo:$colNo\n$reason"
    }
)
