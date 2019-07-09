package samlang.errors

import samlang.ast.Range

class IllegalOtherClassFieldAccess(
    className: String,
    range: Range
) : CompileTimeError.WithRange(
    reason = "It's illegal to access field(s) in class $className outside of that class.",
    range = range
)
