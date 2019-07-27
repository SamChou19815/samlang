package samlang.errors

import samlang.ast.common.Range

class UnresolvedNameError(unresolvedName: String, range: Range) : CompileTimeError.WithRange(
    reason = "Name `$unresolvedName` is not resolved.",
    range = range
)
