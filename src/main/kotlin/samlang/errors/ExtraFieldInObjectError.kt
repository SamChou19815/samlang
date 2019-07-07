package samlang.errors

import samlang.ast.common.Position

class ExtraFieldInObjectError(extraField: String, position: Position) : CompileTimeError.WithPosition(
    reason = "Extra field $extraField in the object", position = position
)
