package samlang.errors

import samlang.parser.Position

class IllegalMethodDefinitionError(name: String, position: Position) : CompileTimeError.WithPosition(
    reason = "It is illegal to define methods inside util module $name.",
    position = position
)
