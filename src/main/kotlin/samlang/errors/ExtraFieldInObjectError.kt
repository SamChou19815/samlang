package samlang.errors

import samlang.ast.common.Range

class ExtraFieldInObjectError(extraField: String, range: Range) : CompileTimeError.WithPosition(
    reason = "Extra field $extraField in the object", range = range
)
