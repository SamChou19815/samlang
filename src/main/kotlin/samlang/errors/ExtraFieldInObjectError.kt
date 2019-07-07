package samlang.errors

import samlang.ast.Range

class ExtraFieldInObjectError(extraField: String, range: Range) : CompileTimeError.WithPosition(
    reason = "Extra field $extraField in the object", range = range
)
