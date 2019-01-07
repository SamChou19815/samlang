package samlang.errors

import samlang.parser.Position

class UnresolvedNameError(unresolvedName: String, position: Position) : CompileTimeError.WithPosition(
    reason = "Name $unresolvedName is not resolved.",
    position = position
)
