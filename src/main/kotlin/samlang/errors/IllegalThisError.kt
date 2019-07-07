package samlang.errors

import samlang.ast.Range

class IllegalThisError(range: Range) : CompileTimeError.WithPosition(
    reason = "Keyword 'this' cannot be used in this context.",
    range = range
)
