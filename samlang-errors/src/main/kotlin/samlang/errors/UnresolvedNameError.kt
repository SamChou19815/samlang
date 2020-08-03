package samlang.errors

import samlang.ast.common.Range

class UnresolvedNameError(unresolvedName: String, range: Range) : CompileTimeError.WithRange(
    errorType = "UnresolvedName",
    reason = "Name `$unresolvedName` is not resolved.",
    range = range
)
