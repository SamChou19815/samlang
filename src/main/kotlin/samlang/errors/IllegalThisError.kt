package samlang.errors

import samlang.parser.Position

class IllegalThisError(position: Position) : CompileTimeError.WithPosition(
    reason = "Keyword 'this' cannot be used in this context.",
    position = position
)
