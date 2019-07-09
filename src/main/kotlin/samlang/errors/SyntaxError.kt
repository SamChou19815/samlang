package samlang.errors

class SyntaxError(private val errors: List<Triple<Int, Int, String>>) : CompileTimeError() {
    override val errorMessage: String
        get() = errors.joinToString(separator = "\n") { (lineNo, colNo, reason) ->
            "SyntaxError:$lineNo:$colNo: $reason"
        }
}
