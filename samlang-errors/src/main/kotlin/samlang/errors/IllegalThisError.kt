package samlang.errors

import samlang.ast.common.Range

class IllegalThisError(range: Range) : CompileTimeError.WithRange(
    reason = "Keyword `this` cannot be used in this context.",
    range = range
)
