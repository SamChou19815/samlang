package samlang.errors

import samlang.ast.Position

class SyntaxError(position: Position, reason: String) :
    CompileTimeError(errorLocation = position.toString(), errorInformation = reason) {
    override val errorClass: String = "SyntaxError"
}
