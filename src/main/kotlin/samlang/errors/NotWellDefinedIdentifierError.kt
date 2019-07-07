package samlang.errors

import samlang.ast.common.Position

class NotWellDefinedIdentifierError(badIdentifier: String, position: Position) :
    CompileTimeError.WithPosition(reason = "$badIdentifier is not well defined.", position = position)
