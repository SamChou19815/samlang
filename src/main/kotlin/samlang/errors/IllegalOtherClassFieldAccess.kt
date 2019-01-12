package samlang.errors

import samlang.parser.Position

class IllegalOtherClassFieldAccess(
    className: String,
    position: Position
) : CompileTimeError.WithPosition(
    reason = "It's illegal to access field(s) in class $className outside of that class.",
    position = position
)
