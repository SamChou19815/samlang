package samlang.errors

import samlang.ast.Position

class SyntaxError(position: Position, reason: String) :
    CompileTimeError(errorInformation = "SyntaxError:$position: $reason") {
    override val errorMessage: String = errorInformation
}
