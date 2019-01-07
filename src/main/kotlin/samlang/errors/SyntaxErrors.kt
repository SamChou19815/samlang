package samlang.errors

class SyntaxErrors(errors: List<Pair<Int, String>>) : CompileTimeError(
    errorMessage = errors.joinToString(separator = "\n", prefix = "\n") { (lineNo, reason) -> "$lineNo: $reason" }
)
