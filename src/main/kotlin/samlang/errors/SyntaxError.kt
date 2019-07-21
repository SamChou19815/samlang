package samlang.errors

import samlang.ast.Range

class SyntaxError(range: Range, reason: String) : CompileTimeError(range = range, reason = reason) {
    override val errorClass: String = "SyntaxError"
}
