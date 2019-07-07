package samlang.errors

import samlang.ast.Range

class IllegalOtherClassFieldAccess(
    className: String,
    range: Range
) : CompileTimeError.WithPosition(
    reason = "It's illegal to access field(s) in class $className outside of that class.",
    range = range
)
