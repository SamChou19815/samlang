package samlang.errors

import samlang.ast.common.Position

class IllegalThisError(position: Position) : CompileTimeError.WithPosition(
    reason = "Keyword 'this' cannot be used in this context.",
    position = position
)
