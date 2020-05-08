package samlang.errors

import samlang.ast.common.Range

class IllegalOtherClassFieldAccess(
    className: String,
    range: Range
) : CompileTimeError.WithRange(
    errorType = "IllegalOtherClassFieldAccess",
    reason = "It's illegal to access field(s) in class `$className` outside of that class.",
    range = range
)
