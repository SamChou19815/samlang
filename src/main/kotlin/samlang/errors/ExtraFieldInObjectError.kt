package samlang.errors

import samlang.parser.Position

class ExtraFieldInObjectError(extraField: String, position: Position) : CompileTimeError.WithPosition(
    reason = "Extra field $extraField in the object", position = position
)
