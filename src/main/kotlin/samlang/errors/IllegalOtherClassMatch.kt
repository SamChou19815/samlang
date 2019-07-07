package samlang.errors

import samlang.ast.common.Position

class IllegalOtherClassMatch(position: Position) : CompileTimeError.WithPosition(
    reason = "It is illegal to match on a value of other class's type.",
    position = position
)
