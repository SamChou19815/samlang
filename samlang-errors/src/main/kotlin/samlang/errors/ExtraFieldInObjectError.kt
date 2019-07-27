package samlang.errors

import samlang.ast.common.Range

class ExtraFieldInObjectError(extraField: String, range: Range) : CompileTimeError.WithRange(
    reason = "Extra field `$extraField` in the object", range = range
)
