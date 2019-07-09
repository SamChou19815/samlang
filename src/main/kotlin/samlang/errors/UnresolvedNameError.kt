package samlang.errors

import samlang.ast.Range

class UnresolvedNameError(unresolvedName: String, range: Range) : CompileTimeError.WithRange(
    reason = "Name $unresolvedName is not resolved.",
    range = range
)
