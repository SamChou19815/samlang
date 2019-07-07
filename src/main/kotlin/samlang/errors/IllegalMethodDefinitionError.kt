package samlang.errors

import samlang.ast.common.Position

class IllegalMethodDefinitionError(name: String, position: Position) : CompileTimeError.WithPosition(
    reason = "It is illegal to define methods inside util module $name.",
    position = position
)
