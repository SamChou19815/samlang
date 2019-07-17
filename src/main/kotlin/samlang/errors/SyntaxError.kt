package samlang.errors

import samlang.ast.Position

class SyntaxError(position: Position, reason: String) :
    CompileTimeError(errorInformation = "$position: $reason") {
    override val errorMessage: String = "SyntaxError:$errorInformation"
}
