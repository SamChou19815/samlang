package samlang.errors

import samlang.ast.common.Range

class UnresolvedNameError(unresolvedName: String, range: Range) : CompileTimeError.WithPosition(
    reason = "Name $unresolvedName is not resolved.",
    range = range
)
