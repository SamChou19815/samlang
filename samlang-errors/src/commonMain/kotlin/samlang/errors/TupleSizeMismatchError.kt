package samlang.errors

import samlang.ast.common.Range

class TupleSizeMismatchError(expectedSize: Int, actualSize: Int, range: Range) : CompileTimeError.WithRange(
    errorType = "TupleSizeMismatch",
    reason = "Incorrect tuple size. Expected: $expectedSize, actual: $actualSize.",
    range = range
)
