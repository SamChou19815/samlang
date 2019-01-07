package samlang.errors

import samlang.parser.Position

class InsufficientTypeInferenceContextError(position: Position) : CompileTimeError.WithPosition(
    reason = "There is not enough context information to decide the type of this expression.",
    position = position
)
